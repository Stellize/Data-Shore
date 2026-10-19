#!/usr/bin/env node
/**
 * Data Shore demo
 *
 * Starts a real archive node over demo/tide-atlas and demo/harbor-sessions,
 * boots the hub in demo mode, pairs the node, and seeds two public archives.
 * Everything you see in the demo is served by the same code a production
 * deployment uses — there are no mock endpoints.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const demoDir = path.join(root, 'demo');

const HUB_PORT = Number(process.env.PORT || 8787);
const HUB_DATA = process.env.DATA_SHORE_HUB_DATA || path.join(root, 'apps/hub/data');
const NODE_PORT = 4771;
const NODE_URL = `http://127.0.0.1:${NODE_PORT}`;
const ADMIN_PASSWORD = 'shore';

const color = (code, text) => `\u001b[${code}m${text}\u001b[0m`;
const dim = (text) => color('2', text);
const teal = (text) => color('38;5;79', text);
const amber = (text) => color('38;5;179', text);
const bold = (text) => color('1', text);

function fail(message) {
  console.error(`\n  ${color('31', 'Demo failed:')} ${message}\n`);
  process.exit(1);
}

async function waitFor(url, { timeoutMs = 30_000, label = url } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return response;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`Timed out waiting for ${label}.`);
}

function ensureBuild() {
  const index = path.join(root, 'apps/web/dist/index.html');
  if (fs.existsSync(index)) return;
  console.log(dim('  Building the web app for the first time…'));
  const result = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) fail('The web build failed.');
}

function ensureDemoAssets() {
  const required = [
    path.join(demoDir, 'node.json'),
    path.join(demoDir, 'seed.json'),
    path.join(demoDir, 'tide-atlas/README.md'),
    path.join(demoDir, 'harbor-sessions/README.md'),
  ];
  for (const file of required) {
    if (!fs.existsSync(file)) {
      fail(`Missing demo asset ${path.relative(root, file)}. The repository may be incomplete.`);
    }
  }
}

async function startNode() {
  const child = spawn(
    process.execPath,
    [path.join(root, 'apps/node/src/index.js'), '--config', path.join(demoDir, 'node.json')],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  child.on('exit', (code) => {
    if (code !== 0 && !shuttingDown) {
      console.error(`\n  Demo node exited with code ${code}.`);
      console.error(logs.join(''));
    }
  });
  await waitFor(`${NODE_URL}/api/health`, { label: 'the demo node' });
  return child;
}

class HubClient {
  constructor(base) {
    this.base = base;
    this.cookie = '';
  }

  async request(method, pathname, body) {
    const headers = { Accept: 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD'].includes(method)) headers['X-DataShore-Request'] = '1';
    const response = await fetch(`${this.base}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = payload?.error?.message || `HTTP ${response.status}`;
      throw new Error(`${method} ${pathname} → ${message}`);
    }
    return payload;
  }
}

async function seed(hubBase, nodeToken) {
  const client = new HubClient(hubBase);
  await client.request('POST', '/api/console/session', { password: ADMIN_PASSWORD });

  const seeds = JSON.parse(fs.readFileSync(path.join(demoDir, 'seed.json'), 'utf8'));
  const inspect = await client.request('POST', '/api/console/inspect', {
    url: NODE_URL,
    token: nodeToken,
  });
  const shares = new Map(inspect.node.shares.map((share) => [share.id, share]));

  let overview = await client.request('GET', '/api/console/overview');
  const existing = overview.archives || [];

  for (const seedEntry of seeds) {
    if (!shares.has(seedEntry.shareId)) {
      console.log(dim(`  Skipping ${seedEntry.title}: share ${seedEntry.shareId} is not on the node.`));
      continue;
    }
    const match = existing.find(
      (archive) =>
        archive.node?.url === NODE_URL && archive.node?.shareId === seedEntry.shareId,
    );
    if (match) {
      await client.request('PATCH', `/api/console/archives/${match.id}`, {
        title: seedEntry.title,
        description: seedEntry.description,
        curator: seedEntry.curator,
        tags: seedEntry.tags,
        visibility: seedEntry.visibility,
        downloads: seedEntry.downloads,
        featured: seedEntry.featured,
        coverPath: seedEntry.coverPath || null,
      });
      console.log(dim(`  Refreshed “${seedEntry.title}”`));
      continue;
    }
    const created = await client.request('POST', '/api/console/archives', {
      url: NODE_URL,
      token: nodeToken,
      shareId: seedEntry.shareId,
      title: seedEntry.title,
      description: seedEntry.description,
      curator: seedEntry.curator,
      tags: seedEntry.tags,
      visibility: seedEntry.visibility,
      downloads: seedEntry.downloads,
      featured: seedEntry.featured,
      coverPath: seedEntry.coverPath || null,
    });
    console.log(dim(`  Published “${created.archive.title}”`));
  }

  process.stdout.write(dim('  Cataloging demo folders'));
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    overview = await client.request('GET', '/api/console/overview');
    const archives = overview.archives || [];
    const busy = archives.some((archive) => archive.sync || archive.status === 'syncing');
    if (!busy) {
      process.stdout.write('\n');
      const failed = archives.filter((archive) => archive.status === 'error');
      if (failed.length) {
        for (const archive of failed) {
          console.log(color('31', `  ${archive.title}: ${archive.syncError}`));
        }
      }
      return archives;
    }
    process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  process.stdout.write('\n');
  fail('Cataloging took too long.');
}

function printBanner(archives) {
  const files = archives.reduce((sum, archive) => sum + (archive.stats?.files || 0), 0);
  const live = archives.filter((archive) => archive.status === 'live').length;
  const line = '─'.repeat(58);
  console.log('');
  console.log(teal(`  ${line}`));
  console.log(`  ${bold('DATA SHORE')}  ${dim('· demo shore')}`);
  console.log(teal(`  ${line}`));
  console.log(`  Site      ${bold(`http://localhost:${HUB_PORT}`)}`);
  console.log(`  Console   ${bold(`http://localhost:${HUB_PORT}/console`)}`);
  console.log(`  Password  ${amber(ADMIN_PASSWORD)}`);
  console.log('');
  console.log(`  ${live} live archives · ${files} files cataloged`);
  for (const archive of archives) {
    const flag = archive.visibility === 'unlisted' ? dim(' (unlisted)') : '';
    console.log(`    · ${archive.title}${flag}  ${dim(`→ /archives/${archive.slug}`)}`);
  }
  console.log('');
  console.log(dim(`  Node is serving demo/tide-atlas and demo/harbor-sessions on port ${NODE_PORT}.`));
  console.log(dim('  Read-only: no upload, edit, or delete endpoints exist.'));
  console.log(teal(`  ${line}`));
  console.log('');
}

let shuttingDown = false;

async function main() {
  ensureDemoAssets();
  ensureBuild();

  const nodeConfig = JSON.parse(fs.readFileSync(path.join(demoDir, 'node.json'), 'utf8'));
  const nodeToken = nodeConfig.token;

  console.log('');
  console.log(dim('  Starting the demo archive node…'));
  const node = await startNode();

  process.env.DATA_SHORE_HUB_DATA = HUB_DATA;
  process.env.DATA_SHORE_ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.DATA_SHORE_DEMO = '1';
  process.env.DATA_SHORE_WEB_DIR = path.join(root, 'apps/web/dist');

  const { loadHubConfig } = await import('../apps/hub/src/config.js');
  const { createHubApp } = await import('../apps/hub/src/app.js');
  const config = loadHubConfig([], process.env);
  config.port = HUB_PORT;
  config.demoMode = true;

  const { app, store } = createHubApp({ config });
  const server = app.listen(HUB_PORT, '0.0.0.0');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  console.log(dim('  Starting the hub and pairing the demo node…'));
  const archives = await seed(`http://127.0.0.1:${HUB_PORT}`, nodeToken);
  printBanner(archives);

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(dim('\n  Closing the demo shore…'));
    try {
      store.save();
    } catch {
      // best effort
    }
    server.close();
    node.kill('SIGTERM');
    setTimeout(() => process.exit(0), 350).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    if (!node.killed) node.kill('SIGTERM');
  });
}

main().catch((err) => fail(err.message));
