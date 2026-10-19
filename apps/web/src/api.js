export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const init = {
    method,
    credentials: 'same-origin',
    signal,
    headers: { Accept: 'application/json', ...headers },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (!['GET', 'HEAD'].includes(method)) {
    init.headers['X-DataShore-Request'] = '1';
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('The hub could not be reached. Check that it is running.', {
      code: 'NETWORK',
    });
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    throw new ApiError(payload?.error?.message || `Request failed (${response.status}).`, {
      status: response.status,
      code: payload?.error?.code || 'HTTP_ERROR',
    });
  }
  return payload;
}

export function archivePath(slug) {
  return `/api/archives/${encodeURIComponent(slug)}`;
}

export function streamUrl(slug, path, { download = false } = {}) {
  const params = new URLSearchParams({ path });
  if (download) params.set('download', '1');
  return `${archivePath(slug)}/stream?${params.toString()}`;
}

export function coverUrl(slug, path) {
  if (!path) return null;
  return streamUrl(slug, path);
}
