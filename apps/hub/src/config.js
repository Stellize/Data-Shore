import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inline] = token.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inline !== undefined) args[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else args[key] = true;
  }
  return args;
}

export function loadHubConfig(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);

  const port = Number(args.port ?? env.PORT ?? env.DATA_SHORE_HUB_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid hub port: ${args.port ?? env.PORT}`);
  }

  const dataDir = path.resolve(
    args.dataDir || env.DATA_SHORE_HUB_DATA || path.join(packageRoot, 'data'),
  );
  fs.mkdirSync(dataDir, { recursive: true });

  const demoMode = Boolean(args.demo) || env.DATA_SHORE_DEMO === '1';

  let adminPassword = args.adminPassword || env.DATA_SHORE_ADMIN_PASSWORD || '';
  let generatedPassword = false;
  if (!adminPassword) {
    if (demoMode) {
      adminPassword = 'shore';
    } else {
      adminPassword = crypto.randomBytes(9).toString('base64url');
      generatedPassword = true;
    }
  }

  const distDir = path.resolve(args.webDir || env.DATA_SHORE_WEB_DIR || path.join(packageRoot, '../web/dist'));

  return {
    port,
    host: String(args.host || env.HOST || env.DATA_SHORE_HUB_HOST || '0.0.0.0'),
    dataDir,
    distDir,
    demoMode,
    adminPassword,
    generatedPassword,
    sessionSecret: readOrCreateSecret(dataDir),
  };
}

function readOrCreateSecret(dataDir) {
  const file = path.join(dataDir, 'session-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // create below
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
