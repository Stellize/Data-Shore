import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createNodeApp } from '../src/app.js';
import { createCatalogManager } from '../src/catalog.js';
import { loadConfig, pairingCode } from '../src/config.js';
import { parseRange } from '../src/stream.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datashore-node-'));
const shareDir = path.join(root, 'share');
const outsideDir = path.join(root, 'outside');
const configPath = path.join(root, 'node.json');
const TOKEN = 'dsn_test_token_123456';

let server;
let base;

function write(relative, contents) {
  const target = path.join(shareDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

before(async () => {
  fs.mkdirSync(path.join(shareDir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(shareDir, 'media'), { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'outside the share');
  write('docs/notes.txt', 'alpha beta gamma delta epsilon\n');
  write('docs/page.html', '<script>alert(1)</script>');
  write('media/clip.mp4', Buffer.alloc(2048, 7));
  write('.hidden', 'not listed');
  fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(shareDir, 'docs', 'escape.txt'));
  fs.symlinkSync(path.join(shareDir, 'docs'), path.join(shareDir, 'docs-link'));

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      name: 'Test node',
      port: 0,
      host: '127.0.0.1',
      token: TOKEN,
      shares: [{ id: 'main', name: 'Main share', path: './share' }],
    }),
  );

  const config = loadConfig(['--config', configPath]);
  const catalogs = createCatalogManager(config);
  for (const catalog of catalogs.list()) await catalog.start();
  const app = createNodeApp({ config, catalogs, logger: { error() {} } });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
});

const url = (path, params = {}) => {
  const target = new URL(path, base);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return target;
};
const authed = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, ...extra });

describe('node authentication and read-only surface', () => {
  it('reports health without a token', async () => {
    const response = await fetch(url('/api/health'));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.service, 'data-shore-node');
    assert.equal(body.protocol, 1);
  });

  it('rejects API requests without the token', async () => {
    const response = await fetch(url('/api/pair'));
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('rejects a wrong token', async () => {
    const response = await fetch(url('/api/pair'), {
      headers: authed({ Authorization: 'Bearer dsn_wrong_token_abcdef' }),
    });
    assert.equal(response.status, 401);
  });

  it('accepts the token from the query string only for media URLs', async () => {
    const media = await fetch(url('/stream/main', { path: 'docs/notes.txt', token: TOKEN }));
    assert.equal(media.status, 200);
    await media.arrayBuffer();

    const api = await fetch(url('/api/pair', { token: TOKEN }));
    assert.equal(api.status, 401, 'query tokens must not authenticate API calls');
  });

  it('refuses every write method', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(url('/api/pair'), { method, headers: authed() });
      assert.equal(response.status, 405, `${method} should be rejected`);
      const body = await response.json();
      assert.equal(body.error.code, 'READ_ONLY');
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    }
  });

  it('lists shares and read-only capability when paired', async () => {
    const response = await fetch(url('/api/pair'), { headers: authed() });
    const body = await response.json();
    assert.equal(body.readOnly, true);
    assert.equal(body.shares[0].id, 'main');
    assert.equal(body.shares[0].stats.state, 'ready');
  });

  it('prints a pairing code carrying url and token', () => {
    const config = loadConfig(['--config', configPath]);
    const code = pairingCode(config);
    const payload = JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));
    assert.equal(payload.kind, 'data-shore-node');
    assert.equal(payload.token, TOKEN);
    assert.match(payload.url, /^http:\/\//);
  });
});

describe('node path jail', () => {
  it('blocks traversal, encoded traversal, and absolute paths', async () => {
    const attempts = ['../outside/secret.txt', '%2e%2e/outside/secret.txt', 'docs/../../outside/secret.txt', '/etc/passwd'];
    for (const attempt of attempts) {
      const response = await fetch(url('/stream/main', { path: attempt, token: TOKEN }));
      assert.ok([400, 403, 404].includes(response.status), `${attempt} → ${response.status}`);
    }
  });

  it('does not list symlinks that escape the share', async () => {
    const response = await fetch(url('/api/browse/main', { path: 'docs' }), {
      headers: authed(),
    });
    const body = await response.json();
    const names = body.entries.map((entry) => entry.name);
    assert.ok(names.includes('notes.txt'));
    assert.ok(!names.includes('escape.txt'), 'escaping symlink must not be listed');
    assert.ok(!names.includes('docs-link'), 'folder symlink must not be listed');
  });

  it('refuses to stream an escaping symlink even when addressed directly', async () => {
    const response = await fetch(url('/stream/main', { path: 'docs/escape.txt', token: TOKEN }));
    assert.equal(response.status, 403);
  });

  it('rejects a file path that is a folder', async () => {
    const response = await fetch(url('/api/file/main', { path: 'docs' }), {
      headers: authed(),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'IS_FOLDER');
  });
});

describe('node media streaming', () => {
  it('supports byte ranges and reports 206', async () => {
    const response = await fetch(url('/stream/main', { path: 'docs/notes.txt', token: TOKEN }), {
      headers: { Range: 'bytes=6-9' },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 6-9/31');
    assert.equal(await response.text(), 'beta');
  });

  it('supports suffix ranges and HEAD requests', async () => {
    const suffix = await fetch(url('/stream/main', { path: 'docs/notes.txt', token: TOKEN }), {
      headers: { Range: 'bytes=-6' },
    });
    assert.equal(suffix.status, 206);
    assert.equal(await suffix.text(), 'silon\n');

    const head = await fetch(url('/stream/main', { path: 'media/clip.mp4', token: TOKEN }), {
      method: 'HEAD',
    });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '2048');
    assert.equal(head.headers.get('accept-ranges'), 'bytes');
  });

  it('rejects unsatisfiable ranges with 416', async () => {
    const response = await fetch(url('/stream/main', { path: 'docs/notes.txt', token: TOKEN }), {
      headers: { Range: 'bytes=900-' },
    });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), 'bytes */31');
  });

  it('answers conditional requests with 304', async () => {
    const first = await fetch(url('/stream/main', { path: 'docs/notes.txt', token: TOKEN }));
    const etag = first.headers.get('etag');
    assert.ok(etag);
    await first.arrayBuffer();
    const second = await fetch(url('/stream/main', { path: 'docs/notes.txt', token: TOKEN }), {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(second.status, 304);
  });

  it('serves HTML as an attachment with a sandbox CSP', async () => {
    const response = await fetch(url('/stream/main', { path: 'docs/page.html', token: TOKEN }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(response.headers.get('content-disposition'), /^attachment/);
    assert.match(response.headers.get('content-security-policy'), /sandbox/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  it('forces attachment on download=1', async () => {
    const response = await fetch(
      url('/stream/main', { path: 'docs/notes.txt', token: TOKEN, download: '1' }),
    );
    assert.match(response.headers.get('content-disposition'), /^attachment/);
  });
});

describe('range parsing', () => {
  it('parses normal, open, and suffix ranges', () => {
    assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
    assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
    assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
    assert.deepEqual(parseRange('bytes=0-5000', 1000), { start: 0, end: 999 });
    assert.equal(parseRange('bytes=1000-', 1000).unsatisfiable, true);
    assert.equal(parseRange('bytes=abc', 1000), null);
    assert.equal(parseRange(null, 1000), null);
  });
});

describe('node catalog and search', () => {
  it('indexes files and folders with sizes', async () => {
    const response = await fetch(url('/api/stats/main'), { headers: authed() });
    const body = await response.json();
    assert.equal(body.state, 'ready');
    assert.equal(body.totals.files, 3);
    assert.ok(body.totals.folders >= 2);
    assert.equal(body.totals.kinds.video, 1);
    assert.equal(body.totals.kinds.image ?? 0, 0);
  });

  it('paginates catalog entries', async () => {
    const response = await fetch(url('/api/entries/main', { token: TOKEN, limit: 2 }), {
      headers: authed(),
    });
    const body = await response.json();
    assert.equal(body.entries.length, 2);
    assert.ok(body.total >= 5);
    assert.ok(!('mtimeMs' in body.entries[0]));
  });

  it('searches by name, kind, and extension', async () => {
    const name = await fetch(url('/api/search/main', { token: TOKEN, q: 'notes' }), {
      headers: authed(),
    });
    const nameBody = await name.json();
    assert.ok(nameBody.results.some((entry) => entry.path === 'docs/notes.txt'));

    const kind = await fetch(url('/api/search/main', { token: TOKEN, q: 'kind:video' }), {
      headers: authed(),
    });
    const kindBody = await kind.json();
    assert.deepEqual(kindBody.results.map((entry) => entry.path), ['media/clip.mp4']);

    const ext = await fetch(url('/api/search/main', { token: TOKEN, q: 'ext:html' }), {
      headers: authed(),
    });
    assert.equal((await ext.json()).results.length, 1);
  });

  it('exposes file metadata without absolute paths', async () => {
    const response = await fetch(url('/api/file/main', { path: 'media/clip.mp4' }), {
      headers: authed(),
    });
    const body = await response.json();
    assert.equal(body.file.name, 'clip.mp4');
    assert.equal(body.file.kind, 'video');
    assert.equal(body.file.size, 2048);
    assert.ok(!('absolute' in body.file));
  });

  it('serves a minimal read-only landing page', async () => {
    const response = await fetch(url('/'));
    const html = await response.text();
    assert.match(html, /read-only/);
    assert.ok(!html.includes(TOKEN), 'landing page must not leak the node token');
  });
});
