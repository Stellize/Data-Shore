#!/usr/bin/env node
import { createHubApp } from './app.js';
import { loadHubConfig } from './config.js';

function main() {
  const config = loadHubConfig();
  const { app, store } = createHubApp({ config });

  const server = app.listen(config.port, config.host, () => {
    const shownHost = config.host === '0.0.0.0' || config.host === '::' ? 'localhost' : config.host;
    console.log('');
    console.log('  Data Shore hub');
    console.log('  ─────────────────────────────────────────────');
    console.log(`  site     http://${shownHost}:${config.port}`);
    console.log(`  console  http://${shownHost}:${config.port}/console`);
    console.log(`  data     ${config.dataDir}`);
    console.log(`  archives ${store.listArchives().length}`);
    if (config.demoMode) {
      console.log('');
      console.log('  DEMO MODE — console password: shore');
      console.log('  Demo folders are generated under demo/. Do not expose this mode publicly.');
    } else if (config.generatedPassword) {
      console.log('');
      console.log('  Console password (generated for this run):');
      console.log(`  ${config.adminPassword}`);
      console.log('  Set DATA_SHORE_ADMIN_PASSWORD to keep it stable.');
    }
    console.log('');
    console.log('  Read-only by design: the hub only proxies GET requests to nodes.');
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${config.port} is already in use. Set PORT to another port.\n`);
    } else {
      console.error(`\n  Hub server error: ${err.message}\n`);
    }
    process.exit(1);
  });

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n  ${signal} received, closing hub…`);
    if (store.saveTimer) {
      clearTimeout(store.saveTimer);
      store.save();
    }
    server.close();
    setTimeout(() => process.exit(0), 200).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
}
