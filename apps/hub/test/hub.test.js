import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createHubApp } from '../src/app.js';
import { loadHubConfig } from '../src/config.js';
import { createNodeApp } from '../../node/src/app.js';
import { createCatalogManager } from '../../node/src/catalog.js';
import { loadConfig } from '../../node/src/config.js';

const NODE_TOKEN = 'dsn_hub_test_token_98765';
const HUB_PASSWORD = 'test-password-123';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datashore-hub-'));
const shareDir = path.join(root, 'archive');
const nodeConfigPath = path.join(root, 'node.json');
const hubDataDir = path.join(root, 'hub-data');
const distDir = path.join(root, 'dist');

let nodeServer;
let hubServer;
let nodeBase;
let hubBase;
let cookie = '';

function write(relative, contents) {
  const target = path.join(shareDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

before(async () => {
  fs.mkdirSync(path.join(shareDir, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(shareDir, 'images'), { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>Data Shore</title>');
  write('notes/tide-notes.txt', 'the tide came in at six and left at noon\n');
  write('notes/report.html', '<html><script>alert("x")</script></html>');
  write('notes/table.csv', 'day,high,low\n1,06:12,12:40\n');
  write('images/cover.png', Buffer.alloc(4096, 3));
  fs.writeFileSync(
    nodeConfigPath,
    JSON.stringify({
      name: 'Test node',
      port: 0,
      token: NODE_TOKEN,
      shares: [
        { id: 'archive', name: 'Test archive share', description: 'fixture', path: './archive' },
      ],
    }),
  );

  const nodeConfig = loadConfig(['--config', nodeConfigPath]);
  const catalogs = createCatalogManager(nodeConfig);
  await Promise.all(catalogs.list().map((catalog) => catalog.start()));
  const nodeApp = createNodeApp({
    config: nodeConfig,
    catalogs,
    logger: { error() {} },
  });
  await new Promise((resolve) => {
    nodeServer = nodeApp.listen(0, '127.0.0.1', resolve);
  });
  nodeBase = `http://127.0.0.1:${nodeServer.address().port}`;

  const hubConfig = loadHubConfig([
    '--port',
    '0',
    '--data-dir',
    hubDataDir,
    '--admin-password',
    HUB_PASSWORD,
    '--web-dir',
    distDir,
  ]);
  const { app } = createHubApp({ config: hubConfig, logger: { error() {} } });
  await new Promise((resolve) => {
    hubServer = app.listen(0, '127.0.0.1', resolve);
  });
  hubBase = `http://127.0.0.1:${hubServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => hubServer.close(resolve));
  await new Promise((resolve) => nodeServer.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
});

async function hubRequest(method, pathname, body, { auth = true, headers = {} } = {}) {
  const init = {
    method,
    headers: { Accept: 'application/json', ...headers },
  };
  if (auth && cookie) init.headers.Cookie = cookie;
  if (body !== undefined) init.headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method)) init.headers['X-DataShore-Request'] = '1';
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${hubBase}${pathname}`, init);
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload };
}

let archiveId;
let slug;

describe('hub pairing and console', () => {
  it('serves public hub settings before any archive exists', async () => {
    const { response, payload } = await hubRequest('GET', '/api/hub', undefined, { auth: false });
    assert.equal(response.status, 200);
    assert.equal(payload.settings.hubName, 'Data Shore');
    assert.equal(payload.stats.archives, 0);
    assert.equal(payload.demoMode, false);
  });

  it('rejects anonymous console access', async () => {
    const { response, payload } = await hubRequest('GET', '/api/console/overview', undefined, {
      auth: false,
    });
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, 'UNAUTHENTICATED');
  });

  it('blocks console writes without the CSRF header', async () => {
    const response = await fetch(`${hubBase}/api/console/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: HUB_PASSWORD }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'CSRF');
  });

  it('rejects a wrong console password', async () => {
    const { response } = await hubRequest('POST', '/api/console/session', { password: 'wrong' });
    assert.equal(response.status, 401);
  });

  it('signs in and issues an HTTP-only session cookie', async () => {
    const { response, payload } = await hubRequest('POST', '/api/console/session', {
      password: HUB_PASSWORD,
    });
    assert.equal(response.status, 200);
    assert.equal(payload.authenticated, true);
    assert.match(cookie, /^ds_session=/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);

    const session = await hubRequest('GET', '/api/console/session');
    assert.equal(session.payload.authenticated, true);
  });

  it('inspects a node and refuses a bad token', async () => {
    const ok = await hubRequest('POST', '/api/console/inspect', {
      url: nodeBase,
      token: NODE_TOKEN,
    });
    assert.equal(ok.response.status, 200);
    assert.equal(ok.payload.node.name, 'Test node');
    assert.equal(ok.payload.node.shares[0].id, 'archive');
    assert.equal(ok.payload.node.readOnly, true);

    const bad = await hubRequest('POST', '/api/console/inspect', {
      url: nodeBase,
      token: 'dsn_not_the_token',
    });
    assert.equal(bad.response.status, 502);

    const unreachable = await hubRequest('POST', '/api/console/inspect', {
      url: 'http://127.0.0.1:1',
      token: NODE_TOKEN,
    });
    assert.equal(unreachable.response.status, 502);
    assert.match(unreachable.payload.error.message, /reach/i);
  });

  it('publishes an archive and syncs its catalog', async () => {
    const { response, payload } = await hubRequest('POST', '/api/console/archives', {
      url: nodeBase,
      token: NODE_TOKEN,
      shareId: 'archive',
      title: 'Tide Notes',
      description: 'A fixture archive for tests.',
      curator: 'Test keeper',
      tags: ['fixture', 'tide'],
      visibility: 'public',
    });
    assert.equal(response.status, 201);
    archiveId = payload.archive.id;
    slug = payload.archive.slug;
    assert.equal(slug, 'tide-notes');

    const started = Date.now();
    let status = 'syncing';
    while (Date.now() - started < 20_000) {
      const overview = await hubRequest('GET', '/api/console/overview');
      const entry = overview.payload.archives.find((archive) => archive.id === archiveId);
      status = entry.status;
      if (status === 'live') break;
      if (status === 'error') throw new Error(entry.syncError);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(status, 'live');
  });

  it('refuses to pair the same share twice', async () => {
    const { response, payload } = await hubRequest('POST', '/api/console/archives', {
      url: nodeBase,
      token: NODE_TOKEN,
      shareId: 'archive',
      title: 'Duplicate',
    });
    assert.equal(response.status, 409);
    assert.equal(payload.error.code, 'ALREADY_PAIRED');
  });
});

describe('public archive reading', () => {
  it('lists the archive publicly with stats', async () => {
    const { payload } = await hubRequest('GET', '/api/archives', undefined, { auth: false });
    assert.equal(payload.archives.length, 1);
    const [archive] = payload.archives;
    assert.equal(archive.title, 'Tide Notes');
    assert.equal(archive.stats.files, 4);
    assert.ok(archive.coverPath === 'images/cover.png');
  });

  it('never exposes node credentials in public responses', async () => {
    const detail = await hubRequest('GET', `/api/archives/${slug}`, undefined, { auth: false });
    const serialized = JSON.stringify(detail.payload);
    assert.ok(!serialized.includes(NODE_TOKEN));
    assert.ok(!serialized.includes('127.0.0.1'));
    assert.ok(!('source' in detail.payload.archive));
  });

  it('browses folders and files', async () => {
    const root = await hubRequest('GET', `/api/archives/${slug}`, undefined, { auth: false });
    assert.deepEqual(
      root.payload.entries.map((entry) => entry.name).sort(),
      ['images', 'notes'],
    );
    assert.equal(root.payload.entries[0].type, 'dir');

    const notes = await hubRequest('GET', `/api/archives/${slug}/browse?path=notes`, undefined, {
      auth: false,
    });
    assert.deepEqual(
      notes.payload.entries.map((entry) => entry.name).sort(),
      ['report.html', 'table.csv', 'tide-notes.txt'],
    );
    assert.deepEqual(notes.payload.breadcrumbs.map((crumb) => crumb.name), ['Archive', 'notes']);
  });

  it('rejects traversal in archive paths', async () => {
    const attempts = ['../etc/passwd', '%2e%2e/secret', '/etc/passwd'];
    for (const attempt of attempts) {
      const { payload } = await hubRequest(
        'GET',
        `/api/archives/${slug}/browse?path=${encodeURIComponent(attempt)}`,
        undefined,
        { auth: false },
      );
      assert.ok(['INVALID_PATH', 'NOT_FOUND'].includes(payload.error.code), attempt);
    }
  });

  it('searches inside the archive and globally', async () => {
    const local = await hubRequest('GET', `/api/archives/${slug}/search?q=tide`, undefined, {
      auth: false,
    });
    assert.ok(local.payload.results.some((entry) => entry.name === 'tide-notes.txt'));

    const global = await hubRequest('GET', '/api/search?q=cover', undefined, { auth: false });
    assert.equal(global.payload.results[0].archive.slug, slug);
    assert.equal(global.payload.results[0].path, 'images/cover.png');
  });

  it('streams a file and supports range requests through the proxy', async () => {
    const full = await fetch(`${hubBase}/api/archives/${slug}/stream?path=notes/tide-notes.txt`);
    assert.equal(full.status, 200);
    assert.equal(await full.text(), 'the tide came in at six and left at noon\n');

    const partial = await fetch(
      `${hubBase}/api/archives/${slug}/stream?path=notes/tide-notes.txt`,
      { headers: { Range: 'bytes=4-7' } },
    );
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 4-7/41');
    assert.equal(await partial.text(), 'tide');
  });

  it('serves downloads as attachments', async () => {
    const response = await fetch(
      `${hubBase}/api/archives/${slug}/stream?path=notes/table.csv&download=1`,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /^attachment/);
  });

  it('serves HTML from the archive as plain text, never executable', async () => {
    const response = await fetch(
      `${hubBase}/api/archives/${slug}/stream?path=notes/report.html`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(response.headers.get('content-disposition'), /^attachment/);
    assert.match(response.headers.get('content-security-policy'), /sandbox/);
  });

  it('returns 404 for paths outside the catalog', async () => {
    const { response, payload } = await hubRequest(
      'GET',
      `/api/archives/${slug}/stream?path=notes/not-in-catalog.txt`,
      undefined,
      { auth: false },
    );
    assert.equal(response.status, 404);
    assert.equal(payload.error.code, 'NOT_FOUND');
  });

  it('applies CSP and JSON errors at the edge', async () => {
    const spa = await fetch(`${hubBase}/archives/${slug}`);
    assert.equal(spa.status, 200);
    assert.match(spa.headers.get('content-security-policy'), /default-src 'self'/);
    const missing = await fetch(`${hubBase}/api/nope`);
    assert.equal(missing.status, 404);
  });
});

describe('archive controls', () => {
  it('turns downloads off while keeping previews', async () => {
    const patched = await hubRequest('PATCH', `/api/console/archives/${archiveId}`, {
      downloads: false,
    });
    assert.equal(patched.response.status, 200);
    assert.equal(patched.payload.archive.downloads, false);

    const download = await fetch(
      `${hubBase}/api/archives/${slug}/stream?path=notes/tide-notes.txt&download=1`,
    );
    assert.equal(download.status, 403);
    assert.equal((await download.json()).error.code, 'DOWNLOADS_DISABLED');

    const inline = await fetch(
      `${hubBase}/api/archives/${slug}/stream?path=notes/tide-notes.txt`,
    );
    assert.equal(inline.status, 200);
    await inline.arrayBuffer();
  });

  it('hides unlisted archives from lists but keeps direct links working', async () => {
    await hubRequest('PATCH', `/api/console/archives/${archiveId}`, { visibility: 'unlisted' });
    const list = await hubRequest('GET', '/api/archives', undefined, { auth: false });
    assert.equal(list.payload.archives.length, 0);

    const direct = await hubRequest('GET', `/api/archives/${slug}`, undefined, { auth: false });
    assert.equal(direct.response.status, 200);
    assert.equal(direct.payload.archive.visibility, 'unlisted');

    await hubRequest('PATCH', `/api/console/archives/${archiveId}`, { visibility: 'public' });
  });

  it('updates public metadata', async () => {
    const patched = await hubRequest('PATCH', `/api/console/archives/${archiveId}`, {
      title: 'Tide Notes Revised',
      tags: 'one, two, three',
      featured: true,
    });
    assert.equal(patched.payload.archive.title, 'Tide Notes Revised');
    assert.deepEqual(patched.payload.archive.tags, ['one', 'two', 'three']);
    assert.equal(patched.payload.archive.featured, true);
  });

  it('lists candidate covers and persists an explicit choice', async () => {
    const covers = await hubRequest('GET', `/api/console/archives/${archiveId}/covers`);
    assert.equal(covers.response.status, 200);
    assert.ok(covers.payload.covers.length >= 1);
    assert.equal(covers.payload.autoCoverPath, 'images/cover.png');
    assert.ok(covers.payload.covers.some((cover) => cover.path === 'images/cover.png'));

    const chosen = await hubRequest('PATCH', `/api/console/archives/${archiveId}`, {
      coverPath: 'images/cover.png',
    });
    assert.equal(chosen.response.status, 200);
    assert.equal(chosen.payload.archive.coverPath, 'images/cover.png');
    assert.equal(chosen.payload.archive.autoCoverPath, 'images/cover.png');

    const detail = await hubRequest('GET', `/api/archives/${slug}`, undefined, { auth: false });
    assert.equal(detail.payload.archive.coverPath, 'images/cover.png');
    assert.equal(detail.payload.archive.autoCoverPath, 'images/cover.png');

    const invalid = await hubRequest('PATCH', `/api/console/archives/${archiveId}`, {
      coverPath: 'notes/tide-notes.txt',
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.payload.error.code, 'COVER_NOT_FOUND');

    const reset = await hubRequest('PATCH', `/api/console/archives/${archiveId}`, {
      coverPath: null,
    });
    assert.equal(reset.response.status, 200);
    assert.equal(reset.payload.archive.coverPath, 'images/cover.png');
  });

  it('resyncs without duplicating entries', async () => {
    const queued = await hubRequest('POST', `/api/console/archives/${archiveId}/sync`);
    assert.equal(queued.response.status, 202);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const catalogFile = path.join(hubDataDir, 'catalogs', `${archiveId}.json`);
    const payload = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
    assert.equal(payload.entries.filter((entry) => entry.type === 'file').length, 4);
    assert.equal(payload.stats.files, 4);
  });

  it('deletes the archive and its catalog', async () => {
    const deleted = await hubRequest('DELETE', `/api/console/archives/${archiveId}`);
    assert.equal(deleted.response.status, 200);
    const after = await hubRequest('GET', `/api/archives/${slug}`, undefined, { auth: false });
    assert.equal(after.response.status, 404);
    assert.ok(!fs.existsSync(path.join(hubDataDir, 'catalogs', `${archiveId}.json`)));
  });

  it('rejects unauthenticated console mutations', async () => {
    const saved = cookie;
    cookie = '';
    const { response } = await hubRequest('PATCH', `/api/console/settings`, { hubName: 'Nope' });
    cookie = saved;
    assert.equal(response.status, 401);
  });

  it('persists hub settings', async () => {
    const { payload } = await hubRequest('PATCH', '/api/console/settings', {
      hubName: 'The Quiet Shore',
      announcement: 'Back after the storm.',
    });
    assert.equal(payload.settings.hubName, 'The Quiet Shore');
    const hub = await hubRequest('GET', '/api/hub', undefined, { auth: false });
    assert.equal(hub.payload.settings.announcement, 'Back after the storm.');
    assert.equal(hub.payload.settings.hubName, 'The Quiet Shore');
  });
});
