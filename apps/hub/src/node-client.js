import { PROTOCOL_VERSION } from '@datashore/shared';

export class NodeClientError extends Error {
  constructor(message, code = 'NODE_ERROR', extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

export function normalizeNodeUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new NodeClientError('A node URL is required.', 'INVALID_URL');
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new NodeClientError('That node URL is not valid.', 'INVALID_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new NodeClientError('Only http and https node URLs are supported.', 'INVALID_URL');
  }
  if (url.username || url.password) {
    throw new NodeClientError('Node URLs cannot include credentials.', 'INVALID_URL');
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export function parsePairingCode(raw) {
  let payload;
  const code = String(raw || '').trim();
  if (!code) throw new NodeClientError('Paste a pairing code or enter a node URL.', 'INVALID_CODE');
  try {
    if (code.startsWith('{')) {
      payload = JSON.parse(code);
    } else {
      payload = JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));
    }
  } catch {
    throw new NodeClientError(
      'That pairing code could not be read. Copy the whole code from the node terminal.',
      'INVALID_CODE',
    );
  }
  if (!payload || payload.kind !== 'data-shore-node') {
    throw new NodeClientError('That is not a Data Shore pairing code.', 'INVALID_CODE');
  }
  const url = normalizeNodeUrl(payload.url);
  const token = String(payload.token || '').trim();
  if (token.length < 8) {
    throw new NodeClientError('The pairing code is missing its node token.', 'INVALID_CODE');
  }
  return {
    url,
    token,
    name: String(payload.name || 'Data Shore node'),
    protocol: Number(payload.protocol || payload.v || 1),
  };
}

export function joinNodeUrl(base, suffix, query = {}) {
  const root = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(String(suffix).replace(/^\/+/, ''), root);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export function createNodeClient(url, token, { timeoutMs = 20_000 } = {}) {
  const base = normalizeNodeUrl(url);
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

  async function requestJson(suffix, { query, method = 'GET', signal, timeout = timeoutMs } = {}) {
    const requestUrl = joinNodeUrl(base, suffix, query);
    let response;
    try {
      response = await fetch(requestUrl, {
        method,
        headers,
        signal: signal || AbortSignal.timeout(timeout),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new NodeClientError(
          'The archive node did not respond in time. Is it online and reachable from this hub?',
          'NODE_TIMEOUT',
        );
      }
      throw new NodeClientError(
        `Could not reach the archive node at ${base}. Check the tunnel or LAN address.`,
        'NODE_UNREACHABLE',
      );
    }
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const message = body?.error?.message || `The node replied with HTTP ${response.status}.`;
      throw new NodeClientError(message, body?.error?.code || 'NODE_HTTP_ERROR', {
        nodeStatus: response.status,
      });
    }
    return body;
  }

  async function health() {
    const requestUrl = joinNodeUrl(base, 'api/health');
    try {
      const response = await fetch(requestUrl, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function inspect() {
    const healthInfo = await health();
    if (!healthInfo || healthInfo.service !== 'data-shore-node') {
      throw new NodeClientError(
        'No Data Shore node answered at that address. Is it running and reachable?',
        'NOT_A_NODE',
      );
    }
    const pair = await requestJson('api/pair');
    if (pair?.protocol && Number(pair.protocol) > PROTOCOL_VERSION) {
      throw new NodeClientError(
        'That node speaks a newer protocol than this hub. Update the hub first.',
        'PROTOCOL_MISMATCH',
      );
    }
    return { health: healthInfo, pair };
  }

  async function stats(shareId, options = {}) {
    return requestJson(`api/stats/${encodeURIComponent(shareId)}`, options);
  }

  async function entriesPage(shareId, offset, limit, options = {}) {
    return requestJson(`api/entries/${encodeURIComponent(shareId)}`, {
      ...options,
      query: { offset, limit },
      timeout: 120_000,
    });
  }

  async function stream(shareId, { path, download, headers: extraHeaders, signal, method = 'GET' } = {}) {
    const url = joinNodeUrl(base, `stream/${encodeURIComponent(shareId)}`, {
      path,
      download: download ? '1' : undefined,
    });
    // undici stringifies `undefined` header values, which would turn an absent
    // If-Range into the literal "undefined" and silently disable range support.
    const requestHeaders = {};
    for (const [key, value] of Object.entries({ ...headers, ...extraHeaders })) {
      if (value !== undefined && value !== null) requestHeaders[key] = String(value);
    }
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        signal,
      });
    } catch (err) {
      throw new NodeClientError(
        'The archive node is unreachable, so this file cannot be streamed right now.',
        'NODE_UNREACHABLE',
      );
    }
    return response;
  }

  return { base, token, health, inspect, stats, entriesPage, stream };
}

export async function waitForIndex(client, shareId, { onProgress, signal, timeoutMs = 15 * 60_000 } = {}) {
  const started = Date.now();
  // Trigger indexing (idempotent) without waiting on the response body.
  const triggerUrl = joinNodeUrl(client.base, `api/index/${encodeURIComponent(shareId)}`);
  fetch(triggerUrl, {
    headers: { Authorization: `Bearer ${client.token}` },
    signal,
  }).catch(() => {});

  while (Date.now() - started < timeoutMs) {
    const state = await client.stats(shareId, { signal });
    onProgress?.(state);
    if (state.state === 'ready') return state;
    if (state.state === 'error') {
      throw new NodeClientError(state.error || 'The node could not index this folder.', 'INDEX_FAILED');
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new NodeClientError('Indexing is taking unusually long. Try again once the node finishes.', 'INDEX_TIMEOUT');
}

export async function fetchAllEntries(client, shareId, { onProgress, signal, maxEntries = 250_000 } = {}) {
  const limit = 2000;
  let offset = 0;
  let total = null;
  let truncated = false;
  const entries = [];
  while (total === null || offset < total) {
    const page = await client.entriesPage(shareId, offset, limit, { signal });
    if (!Array.isArray(page.entries)) {
      throw new NodeClientError('The node returned an unexpected catalog page.', 'BAD_PAGE');
    }
    total = page.total ?? entries.length;
    const remaining = maxEntries - entries.length;
    if (page.entries.length > remaining) {
      entries.push(...page.entries.slice(0, Math.max(0, remaining)));
      truncated = true;
    } else {
      entries.push(...page.entries);
    }
    offset += page.entries.length;
    onProgress?.({ fetched: entries.length, total, stats: page.stats });
    if (truncated) break;
    if (page.entries.length === 0) break;
  }
  return { entries, total, truncated };
}
