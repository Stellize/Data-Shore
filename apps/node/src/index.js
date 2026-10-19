#!/usr/bin/env node
import { createNodeApp } from './app.js';
import { createCatalogManager } from './catalog.js';
import { helpText, loadConfig, pairingCode } from './config.js';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`\n  ${err.message}\n`);
    console.error('  Run with --help for usage.\n');
    process.exitCode = 1;
    return;
  }

  if (config.help) {
    console.log(helpText());
    return;
  }

  const catalogs = createCatalogManager(config);
  const app = createNodeApp({ config, catalogs });
  const server = app.listen(config.port, config.host, () => {
    const shown = config.host === '0.0.0.0' || config.host === '::' ? '0.0.0.0' : config.host;
    console.log('');
    console.log(`  Data Shore node  "${config.name}"`);
    console.log(`  ─────────────────────────────────────────────`);
    for (const share of config.shares) {
      console.log(`  share  ${share.id.padEnd(22)} ${share.name}`);
    }
    console.log(`  listen ${`http://${shown}:${config.port}`}`);
    console.log('');
    console.log('  Pairing code (paste into the hub console):');
    console.log('');
    console.log(`  ${pairingCode(config)}`);
    console.log('');
    if (config.tokenGenerated) {
      console.log('  A token was generated for this run. Set "token" in the config');
      console.log('  to keep it stable across restarts.');
      console.log('');
    }
    console.log('  Read-only: only GET/HEAD endpoints exist. No writes, ever.');
    console.log('');

    for (const catalog of catalogs.list()) {
      catalog
        .start()
        .then((index) => {
          console.log(
            `  indexed "${catalog.share.id}": ${index.stats.files} files, ` +
              `${index.stats.folders} folders in ${index.stats.tookMs}ms`,
          );
        })
        .catch((err) => {
          console.error(`  index "${catalog.share.id}" failed: ${err.message}`);
        });
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${config.port} is already in use. Try --port 4771.\n`);
    } else {
      console.error(`\n  Node server error: ${err.message}\n`);
    }
    process.exit(1);
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n  ${signal} received, closing node…`);
    server.close();
    await catalogs.stopAll();
    setTimeout(() => process.exit(0), 250).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
