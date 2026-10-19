import crypto from 'node:crypto';
import express from 'express';
import { PROTOCOL_VERSION } from '@datashore/shared';
import { NODE_VERSION } from './config.js';
import { NodeError, listDirectory, statInShare } from './fsutil.js';
import { searchIndex } from './search.js';
import { sendFile } from './stream.js';

const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_FAILURES = 90;
const PAGE_MAX = 5000;

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

function publicEntry(entry) {
  const { lower, mtimeMs, ...rest } = entry;
  return rest;
}

export function createNodeApp({ config, catalogs, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('trust proxy', true);

  const failures = new Map();

  const isAuthorized = (req, { allowQuery = false } = {}) => {
    const supplied = bearerToken(req) || (allowQuery ? req.query.token : '');
    return safeEqual(supplied, config.token);
  };

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'interest-cohort=()');
    next();
  });

  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({
      error: {
        code: 'READ_ONLY',
        message: 'This archive node is read-only. Only GET and HEAD are supported.',
      },
    });
  });

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.path === '/health') return next();

    if (!isAuthorized(req)) {
      const key = req.ip || 'unknown';
      const now = Date.now();
      const record = failures.get(key);
      const count = record && now - record.first < AUTH_WINDOW_MS ? record.count + 1 : 1;
      failures.set(key, { first: record && now - record.first < AUTH_WINDOW_MS ? record.first : now, count });
      if (count > AUTH_MAX_FAILURES) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({
          error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many failed attempts. Try again shortly.' },
        });
      }
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'A valid node token is required.' },
      });
    }
    return next();
  });

  app.use('/stream', (req, res, next) => {
    // Media URLs need to work in <img>/<video> tags, which cannot send headers.
    if (isAuthorized(req, { allowQuery: true })) return next();
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'A valid node token is required.' },
    });
  });

  const shareOr404 = (req, res) => {
    const catalog = catalogs.get(req.params.share);
    if (!catalog) {
      res.status(404).json({
        error: { code: 'UNKNOWN_SHARE', message: 'This node has no such share.' },
      });
      return null;
    }
    return catalog;
  };

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'data-shore-node',
      protocol: PROTOCOL_VERSION,
      version: NODE_VERSION,
      name: config.name,
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  });

  app.get('/api/pair', (req, res) => {
    res.json({
      kind: 'data-shore-node',
      protocol: PROTOCOL_VERSION,
      version: NODE_VERSION,
      name: config.name,
      readOnly: true,
      shares: config.shares.map((share) => {
        const catalog = catalogs.get(share.id);
        return {
          id: share.id,
          name: share.name,
          description: share.description,
          stats: catalog ? catalog.snapshotStats() : null,
        };
      }),
      pairedAt: new Date().toISOString(),
    });
  });

  app.get('/api/stats/:share', async (req, res) => {
    const catalog = shareOr404(req, res);
    if (!catalog) return;
    res.json({
      share: { id: catalog.share.id, name: catalog.share.name },
      ...catalog.snapshotStats(),
    });
  });

  app.get('/api/index/:share', async (req, res) => {
    const catalog = shareOr404(req, res);
    if (!catalog) return;
    if (req.query.refresh === '1') {
      catalog.refresh().catch((err) => logger.error(`[index] ${catalog.share.id}: ${err.message}`));
    } else {
      catalog.start();
    }
    res.status(202).json({ share: catalog.share.id, ...catalog.snapshotStats() });
  });

  app.get('/api/entries/:share', async (req, res, next) => {
    try {
      const catalog = shareOr404(req, res);
      if (!catalog) return;
      const index = await catalog.ensure();
      const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
      const limit = Math.min(PAGE_MAX, Math.max(1, Number.parseInt(req.query.limit, 10) || 2000));
      const slice = index.entries.slice(offset, offset + limit);
      res.json({
        share: catalog.share.id,
        total: index.entries.length,
        offset,
        limit,
        entries: slice.map(publicEntry),
        stats: {
          files: index.stats.files,
          folders: index.stats.folders,
          bytes: index.stats.bytes,
          kinds: index.stats.kinds,
          latestMtime: index.stats.latestMtime,
          truncated: index.stats.truncated,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/browse/:share', async (req, res, next) => {
    try {
      const catalog = shareOr404(req, res);
      if (!catalog) return;
      const listing = await listDirectory(catalog.share, req.query.path || '');
      res.json(listing);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/search/:share', async (req, res, next) => {
    try {
      const catalog = shareOr404(req, res);
      if (!catalog) return;
      const index = await catalog.ensure();
      const query = String(req.query.q || '');
      const limit = Math.min(300, Math.max(1, Number.parseInt(req.query.limit, 10) || 120));
      res.json({ share: catalog.share.id, ...searchIndex(index, query, { limit }) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/file/:share', async (req, res, next) => {
    try {
      const catalog = shareOr404(req, res);
      if (!catalog) return;
      const file = await statInShare(catalog.share, req.query.path || '');
      const { absolute, mtimeMs, ...entry } = file;
      res.json({ share: catalog.share.id, file: entry });
    } catch (err) {
      next(err);
    }
  });

  app.get('/stream/:share', async (req, res, next) => {
    try {
      const catalog = shareOr404(req, res);
      if (!catalog) return;
      const file = await statInShare(catalog.share, req.query.path || '');
      await sendFile(req, res, file);
    } catch (err) {
      next(err);
    }
  });

  app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
    const shares = config.shares
      .map((share) => `<li><strong>${escapeHtml(share.name)}</strong> <span>${escapeHtml(share.id)}</span></li>`)
      .join('');
    res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.name)} · Data Shore node</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 3rem 1.5rem; background: #0e1b24; color: #e8f1f2; }
  main { max-width: 42rem; margin: 0 auto; }
  .badge { display: inline-block; font: 600 11px/1 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; color: #7fd1c1; border: 1px solid #2c5a5a; border-radius: 999px; padding: .5rem .75rem; }
  h1 { font-size: 2rem; margin: 1.25rem 0 .5rem; }
  p { color: #a9c1c7; }
  ul { padding-left: 1.1rem; }
  li span { color: #7d9aa1; font: 12px ui-monospace, monospace; margin-left: .5rem; }
  code { background: #162b36; border: 1px solid #244049; border-radius: 6px; padding: .15rem .4rem; font-size: .85em; }
  .note { border-top: 1px solid #244049; margin-top: 2rem; padding-top: 1rem; font-size: .9rem; }
</style></head>
<body><main>
  <span class="badge">Data Shore node · read-only</span>
  <h1>${escapeHtml(config.name)}</h1>
  <p>This node publishes the folders below as a private, read-only archive.
  It has no upload, edit, or delete endpoints — only GET.</p>
  <ul>${shares}</ul>
  <div class="note">
    <p>Open your Data Shore hub console and paste the pairing code printed in the
    node terminal to make this archive public. This page intentionally exposes no
    file names or tokens.</p>
    <p>Version ${NODE_VERSION} · protocol ${PROTOCOL_VERSION}</p>
  </div>
</main></body></html>`);
  });

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof NodeError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    logger.error(`[node] ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    if (res.headersSent) return res.end();
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'The node hit an unexpected error.' },
    });
  });

  return app;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
