import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express from 'express';
import { PROTOCOL_VERSION } from '@datashore/shared';
import {
  CatalogStore,
  archiveHighlights,
  breadcrumbsFor,
  browseArchive,
  catalogFile,
  publicEntry,
  searchCatalog,
} from './catalog.js';
import { NodeClientError, createNodeClient, normalizeNodeUrl, parsePairingCode } from './node-client.js';
import {
  HubStore,
  publicSettings,
  toConsoleArchive,
  toPublicArchive,
} from './store.js';
import { createSyncService } from './sync.js';

const HUB_VERSION = '0.1.0';
const SESSION_COOKIE = 'ds_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const record = buckets.get(key);
    const fresh = !record || now - record.start > windowMs;
    if (fresh) {
      buckets.set(key, { start: now, count: 1 });
      return true;
    }
    record.count += 1;
    return record.count <= max;
  };
}

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function isSecureRequest(req) {
  return req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
}

export function createHubApp({ config, logger = console }) {
  const store = new HubStore(config.dataDir);
  const catalogs = new CatalogStore(path.join(config.dataDir, 'catalogs'));
  const syncService = createSyncService({ store, catalogs });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  const hubHmac = (value) =>
    crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');

  const verifySession = (token) => {
    if (!token) return false;
    const [expRaw, signature] = String(token).split('.');
    if (!expRaw || !signature) return false;
    const expiration = Number(expRaw);
    if (!Number.isFinite(expiration) || expiration < Date.now()) return false;
    return safeEqual(signature, hubHmac(expRaw));
  };

  const loginLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 12 });

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'interest-cohort=()');
    const cookies = parseCookies(req.headers.cookie);
    req.admin = verifySession(cookies[SESSION_COOKIE]);
    next();
  });

  app.use(express.json({ limit: '128kb' }));

  const jsonError = (res, status, code, message) =>
    res.status(status).json({ error: { code, message } });

  const publicArchives = () =>
    store
      .listArchives()
      .filter((archive) => archive.syncedAt && archive.visibility === 'public');

  function findArchiveForView(req, slug) {
    const archive = store.getArchiveBySlug(slug);
    if (!archive) return null;
    if (req.admin) return archive;
    if (!archive.syncedAt) return null;
    return archive;
  }

  async function decorateArchive(archive, { consoleView = false } = {}) {
    const catalog = await catalogs.load(archive.id);
    const base = consoleView ? toConsoleArchive(archive) : toPublicArchive(archive);
    const autoCover = catalog?.coverPath || null;
    const chosen = base.coverPath && catalog?.byPath.get(base.coverPath);
    return {
      ...base,
      coverPath: chosen && chosen.type === 'file' && chosen.kind === 'image' ? base.coverPath : autoCover,
      autoCoverPath: autoCover,
      hasCatalog: Boolean(catalog),
    };
  }

  function hubStats() {
    const archives = publicArchives();
    let files = 0;
    let bytes = 0;
    let lastSyncedAt = null;
    const nodes = new Set();
    for (const archive of archives) {
      files += archive.stats?.files || 0;
      bytes += archive.stats?.bytes || 0;
      if (!lastSyncedAt || archive.syncedAt > lastSyncedAt) lastSyncedAt = archive.syncedAt;
      if (archive.source?.url) nodes.add(archive.source.url);
    }
    return {
      archives: archives.length,
      files,
      bytes,
      nodes: nodes.size,
      lastSyncedAt,
      activity: store.db.activity.length,
    };
  }

  // ── public API ────────────────────────────────────────────────────────────

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'data-shore-hub', version: HUB_VERSION, protocol: PROTOCOL_VERSION });
  });

  app.get('/api/hub', (req, res) => {
    res.json({
      settings: publicSettings(store.settings),
      stats: hubStats(),
      demoMode: config.demoMode,
      version: HUB_VERSION,
    });
  });

  app.get('/api/archives', async (req, res, next) => {
    try {
      const archives = await Promise.all(publicArchives().map((archive) => decorateArchive(archive)));
      archives.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return String(b.syncedAt || '').localeCompare(String(a.syncedAt || ''));
      });
      res.json({ archives });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/archives/:slug', async (req, res, next) => {
    try {
      const archive = findArchiveForView(req, req.params.slug);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      const catalog = await catalogs.load(archive.id);
      if (!catalog) {
        return jsonError(
          res,
          409,
          'NOT_READY',
          'This archive is still being cataloged. Check back in a moment.',
        );
      }
      const listing = await browseArchive(catalogs, archive, req.query.path || '');
      const highlights = archiveHighlights(catalog, archive);
      if (!req.admin && !req.query.path) store.increment(archive.id, 'views');
      res.json({
        archive: await decorateArchive(archive),
        ...listing,
        highlights,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/archives/:slug/browse', async (req, res, next) => {
    try {
      const archive = findArchiveForView(req, req.params.slug);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      const listing = await browseArchive(catalogs, archive, req.query.path || '');
      if (!listing) return jsonError(res, 409, 'NOT_READY', 'This archive is not ready yet.');
      const decorated = await decorateArchive(archive);
      res.json({ archive: decorated, ...listing });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/archives/:slug/search', async (req, res, next) => {
    try {
      const archive = findArchiveForView(req, req.params.slug);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      const catalog = await catalogs.load(archive.id);
      if (!catalog) return jsonError(res, 409, 'NOT_READY', 'This archive is not ready yet.');
      const result = searchCatalog(catalog, req.query.q || '', {
        limit: 150,
        kind: req.query.kind || '',
        type: req.query.type || '',
      });
      res.json({ archive: toPublicArchive(archive), ...result });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/archives/:slug/file', async (req, res, next) => {
    try {
      const archive = findArchiveForView(req, req.params.slug);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      const catalog = await catalogs.load(archive.id);
      const entry = catalogFile(catalog, archive, req.query.path || '');
      if (!entry) return jsonError(res, 404, 'NOT_FOUND', 'That file is not in this archive.');
      const parent = entry.dir || '';
      res.json({
        archive: toPublicArchive(archive),
        file: publicEntry(entry),
        breadcrumbs: breadcrumbsFor(archive.slug, parent),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/search', async (req, res, next) => {
    try {
      const query = String(req.query.q || '').trim();
      if (!query) return res.json({ query, total: 0, results: [], archives: [] });
      const kind = String(req.query.kind || '');
      const archives = publicArchives();
      const groups = await Promise.all(
        archives.map(async (archive) => {
          const catalog = await catalogs.load(archive.id);
          if (!catalog) return null;
          const result = searchCatalog(catalog, query, { limit: 16, kind });
          return result.results.length ? { archive, result } : null;
        }),
      );
      const results = [];
      for (const group of groups.filter(Boolean)) {
        for (const item of group.result.results) {
          results.push({
            ...item,
            archive: {
              slug: group.archive.slug,
              title: group.archive.title,
              coverPath: null,
            },
          });
        }
      }
      results.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.mtime || '').localeCompare(a.mtime || ''));
      res.json({
        query,
        total: groups.filter(Boolean).reduce((sum, group) => sum + group.result.total, 0),
        results: results.slice(0, 80),
        archives: groups
          .filter(Boolean)
          .map((group) => ({
            slug: group.archive.slug,
            title: group.archive.title,
            matches: group.result.total,
          })),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/archives/:slug/stream', async (req, res, next) => {
    const archive = findArchiveForView(req, req.params.slug);
    if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
    const catalog = await catalogs.load(archive.id);
    const entry = catalogFile(catalog, archive, req.query.path || '');
    if (!entry) return jsonError(res, 404, 'NOT_FOUND', 'That file is not in this archive.');

    const download = req.query.download === '1' || req.query.download === 'true';
    if (download && !archive.downloads) {
      return jsonError(res, 403, 'DOWNLOADS_DISABLED', 'Downloads are turned off for this archive.');
    }

    const client = createNodeClient(archive.source.url, archive.source.token);
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    let upstream;
    try {
      upstream = await client.stream(archive.source.shareId, {
        path: entry.path,
        download,
        method: req.method,
        signal: controller.signal,
        headers: {
          Range: req.headers.range,
          'If-Range': req.headers['if-range'],
          'If-None-Match': req.headers['if-none-match'],
          'If-Modified-Since': req.headers['if-modified-since'],
        },
      });
    } catch (err) {
      return next(err);
    }

    if (!upstream.ok) {
      const status = upstream.status === 404 ? 404 : upstream.status === 416 ? 416 : 502;
      const message =
        upstream.status === 401 || upstream.status === 403
          ? 'The node rejected this hub’s credentials. Re-pair the node from the console.'
          : upstream.status === 404
            ? 'That file is no longer available on the node.'
            : 'The node could not stream that file.';
      if (upstream.status === 416) {
        const range = upstream.headers.get('content-range');
        if (range) res.setHeader('Content-Range', range);
      }
      return jsonError(res, status, 'STREAM_FAILED', message);
    }

    const copyHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
      'content-disposition',
      'cache-control',
      'content-security-policy',
    ];
    for (const header of copyHeaders) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.statusCode = upstream.status;

    if (download && upstream.status < 400) store.increment(archive.id, 'downloadCount');

    if (req.method === 'HEAD' || upstream.status === 304 || upstream.status === 416 || !upstream.body) {
      return res.end();
    }

    try {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (err) {
      if (!['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'ABORT_ERR'].includes(err.code)) {
        logger.error(`[stream] ${archive.slug}/${entry.path}: ${err.message}`);
      }
    }
  });

  // ── console session ───────────────────────────────────────────────────────

  app.use('/api/console', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.get('x-datashore-request') !== '1' || !sameOrigin(req)) {
        return jsonError(res, 403, 'CSRF', 'This request was blocked. Reload the console and try again.');
      }
    }
    next();
  });

  app.get('/api/console/session', (req, res) => {
    res.json({
      authenticated: Boolean(req.admin),
      demoMode: config.demoMode,
      hubName: store.settings.hubName,
    });
  });

  app.post('/api/console/session', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!loginLimiter(ip)) {
      res.setHeader('Retry-After', '300');
      return jsonError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many sign-in attempts. Wait a few minutes.');
    }
    const password = String(req.body?.password || '');
    if (!safeEqual(password, config.adminPassword)) {
      return jsonError(res, 401, 'BAD_PASSWORD', 'That password does not match this hub.');
    }
    const expiration = Date.now() + SESSION_TTL_MS;
    const token = `${expiration}.${hubHmac(String(expiration))}`;
    const cookie = [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
      ...(isSecureRequest(req) ? ['Secure'] : []),
    ].join('; ');
    res.setHeader('Set-Cookie', cookie);
    res.json({ authenticated: true });
  });

  app.delete('/api/console/session', (req, res) => {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    res.json({ authenticated: false });
  });

  const requireAdmin = (req, res, next) => {
    if (!req.admin) {
      return jsonError(res, 401, 'UNAUTHENTICATED', 'Sign in to the console to do that.');
    }
    return next();
  };

  app.use('/api/console', requireAdmin);

  // ── console API ───────────────────────────────────────────────────────────

  app.get('/api/console/overview', async (req, res, next) => {
    try {
      const archives = await Promise.all(
        store.listArchives().map(async (archive) => {
          const decorated = await decorateArchive(archive, { consoleView: true });
          return {
            ...decorated,
            sync: syncService.statusFor(archive.id),
          };
        }),
      );
      res.json({
        settings: store.settings,
        stats: hubStats(),
        archives,
        activity: store.db.activity,
        demoMode: config.demoMode,
        version: HUB_VERSION,
        protocol: PROTOCOL_VERSION,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/console/archives/:id/covers', async (req, res, next) => {
    try {
      const archive = store.getArchiveById(req.params.id);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      const catalog = await catalogs.load(archive.id);
      if (!catalog) return jsonError(res, 409, 'NOT_READY', 'This archive has no catalog yet.');
      const images = catalog.entries
        .filter((entry) => entry.type === 'file' && entry.kind === 'image')
        .sort((a, b) => (b.size || 0) - (a.size || 0))
        .slice(0, 72)
        .map((entry) => ({
          path: entry.path,
          name: entry.name,
          size: entry.size,
          mtime: entry.mtime,
        }));
      res.json({ covers: images, autoCoverPath: catalog.coverPath || null });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/console/archives/:id', async (req, res, next) => {
    try {
      const archive = store.getArchiveById(req.params.id);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      res.json({
        archive: {
          ...(await decorateArchive(archive, { consoleView: true })),
          sync: syncService.statusFor(archive.id),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  function credentialsFromBody(body) {
    if (body?.code) return parsePairingCode(body.code);
    const url = normalizeNodeUrl(body?.url || '');
    const token = String(body?.token || '').trim();
    if (token.length < 8) {
      throw new NodeClientError('Enter the node URL and its access token.', 'INVALID_CODE');
    }
    return { url, token, name: 'Data Shore node' };
  }

  app.post('/api/console/inspect', async (req, res, next) => {
    try {
      const credentials = credentialsFromBody(req.body);
      const client = createNodeClient(credentials.url, credentials.token);
      const { health, pair } = await client.inspect();
      res.json({
        node: {
          name: pair.name || health.name || credentials.name,
          url: credentials.url,
          version: health.version,
          protocol: pair.protocol,
          readOnly: Boolean(pair.readOnly),
          shares: (pair.shares || []).map((share) => ({
            id: share.id,
            name: share.name,
            description: share.description,
            stats: share.stats?.totals || null,
            state: share.stats?.state || 'cold',
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/console/archives', async (req, res, next) => {
    try {
      const body = req.body || {};
      const credentials = credentialsFromBody(body);
      const shareId = String(body.shareId || '').trim();
      if (!shareId) return jsonError(res, 400, 'SHARE_REQUIRED', 'Choose a share to publish.');

      const existing = store.findArchiveBySource(credentials.url, shareId);
      if (existing) {
        return jsonError(
          res,
          409,
          'ALREADY_PAIRED',
          `That share is already published as “${existing.title}”.`,
        );
      }

      const client = createNodeClient(credentials.url, credentials.token);
      const { pair } = await client.inspect();
      const share = (pair.shares || []).find((item) => item.id === shareId);
      if (!share) {
        return jsonError(res, 404, 'SHARE_NOT_FOUND', 'The node no longer offers that share.');
      }

      const archive = store.createArchive({
        title: String(body.title || share.name || 'Untitled archive'),
        description: String(body.description || share.description || ''),
        curator: body.curator,
        tags: body.tags,
        visibility: body.visibility,
        downloads: body.downloads,
        featured: body.featured,
        coverPath: body.coverPath,
        source: {
          url: credentials.url,
          token: credentials.token,
          shareId,
          nodeName: pair.name || credentials.name,
        },
      });

      syncService
        .sync(archive.id)
        .catch((err) => logger.error(`[sync] ${archive.slug}: ${err.message}`));

      res.status(201).json({
        archive: {
          ...(await decorateArchive(archive, { consoleView: true })),
          sync: syncService.statusFor(archive.id),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/console/archives/:id', async (req, res, next) => {
    try {
      const body = req.body || {};
      const allowed = [
        'title',
        'description',
        'curator',
        'tags',
        'visibility',
        'featured',
        'downloads',
        'coverPath',
      ];
      const patch = Object.fromEntries(
        Object.entries(body).filter(([key]) => allowed.includes(key)),
      );
      if (patch.title !== undefined && !String(patch.title).trim()) {
        return jsonError(res, 400, 'TITLE_REQUIRED', 'An archive needs a title.');
      }
      if (patch.coverPath) {
        const catalog = await catalogs.load(req.params.id);
        const entry = catalog?.byPath.get(String(patch.coverPath));
        if (!entry || entry.type !== 'file' || entry.kind !== 'image') {
          return jsonError(
            res,
            400,
            'COVER_NOT_FOUND',
            'Pick an image that exists in this archive, or reset to automatic.',
          );
        }
      }
      const archive = store.updateArchive(req.params.id, patch);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      res.json({
        archive: {
          ...(await decorateArchive(archive, { consoleView: true })),
          sync: syncService.statusFor(archive.id),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/console/archives/:id', async (req, res, next) => {
    try {
      const archive = store.getArchiveById(req.params.id);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      syncService.cancel(archive.id);
      store.deleteArchive(archive.id);
      await catalogs.remove(archive.id);
      res.json({ deleted: true, id: archive.id });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/console/archives/:id/sync', async (req, res, next) => {
    try {
      const archive = store.getArchiveById(req.params.id);
      if (!archive) return jsonError(res, 404, 'NOT_FOUND', 'That archive does not exist.');
      syncService
        .sync(archive.id)
        .catch((err) => logger.error(`[sync] ${archive.slug}: ${err.message}`));
      res.status(202).json({
        queued: true,
        sync: syncService.statusFor(archive.id),
      });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/console/settings', (req, res, next) => {
    try {
      const settings = store.updateSettings(req.body || {});
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  // ── static site and errors ────────────────────────────────────────────────

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } });
  });

  const indexPath = path.join(config.distDir, 'index.html');
  const assetsDir = path.join(config.distDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    app.use('/assets', express.static(assetsDir, { maxAge: '1y', immutable: true }));
  }
  if (fs.existsSync(config.distDir)) {
    app.use(express.static(config.distDir, { index: false, maxAge: '1h' }));
  }

  const spaCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (!fs.existsSync(indexPath)) {
      return res.status(503).send(missingBuildPage());
    }
    res.setHeader('Content-Security-Policy', spaCsp);
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(indexPath);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof NodeClientError) {
      const clientError = ['INVALID_CODE', 'INVALID_URL', 'PROTOCOL_MISMATCH'].includes(err.code);
      return jsonError(res, clientError ? 400 : 502, err.code || 'NODE_ERROR', err.message);
    }
    if (err.status && Number.isInteger(err.status)) {
      return jsonError(res, err.status, err.code || 'ERROR', err.message);
    }
    if (err.type === 'entity.parse.failed') {
      return jsonError(res, 400, 'BAD_JSON', 'The request body was not valid JSON.');
    }
    logger.error(`[hub] ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    if (res.headersSent) return res.end();
    return jsonError(res, 500, 'INTERNAL', 'The hub hit an unexpected error.');
  });

  return { app, store, catalogs, syncService };
}

function missingBuildPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data Shore · build needed</title>
<style>
  body { font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; background:#08171f; color:#eaf3f1;
    display:grid; place-items:center; min-height:100vh; margin:0; padding:2rem; }
  main { max-width: 38rem; }
  code, pre { font-family: ui-monospace, monospace; background:#0f2732; border:1px solid #1e3b47;
    border-radius:8px; padding:.15rem .4rem; }
  pre { padding:1rem; overflow:auto; }
  a { color:#67d6bf; }
  h1 { font-family: Georgia, serif; }
</style></head><body><main>
<h1>The shore is quiet.</h1>
<p>The web app has not been built yet. From the repository root run:</p>
<pre>npm install
npm run build
npm start</pre>
<p>Then reload this page. The API is already answering at <code>/api/hub</code>.</p>
</main></body></html>`;
}
