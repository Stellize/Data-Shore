import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { slugify } from '@datashore/shared';

export const NODE_VERSION = '0.1.0';

const DEFAULTS = {
  port: 4770,
  host: '127.0.0.1',
  name: 'Data Shore node',
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function newToken() {
  return `dsn_${crypto.randomBytes(24).toString('base64url')}`;
}

function uniqueShareId(base, used) {
  let id = slugify(base) || 'share';
  let n = 2;
  while (used.has(id)) {
    id = `${slugify(base) || 'share'}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

export function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);

  if (args.help || args.h) {
    return { help: true };
  }

  const explicitConfig = args.config || env.DATA_SHORE_NODE_CONFIG;
  const defaultConfigPath = path.resolve(process.cwd(), 'datashore.node.json');
  const configPath = explicitConfig
    ? path.resolve(process.cwd(), explicitConfig)
    : fs.existsSync(defaultConfigPath)
      ? defaultConfigPath
      : null;

  let fileConfig = {};
  let configDir = process.cwd();

  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      throw new Error(`Could not parse ${configPath}: ${err.message}`);
    }
    configDir = path.dirname(configPath);
  }

  let sharesInput = Array.isArray(fileConfig.shares) ? fileConfig.shares : [];
  if (sharesInput.length === 0 && fileConfig.root) {
    sharesInput = [{ name: fileConfig.name || DEFAULTS.name, path: fileConfig.root }];
  }
  if (args.root) {
    sharesInput = [{ name: args.name || fileConfig.name || DEFAULTS.name, path: args.root }];
  }

  if (sharesInput.length === 0) {
    throw new Error(
      'No folders configured. Create datashore.node.json (see datashore.example.json) or run:\n' +
        '  npx datashore-node --root "/path/to/folder" --name "My archive"',
    );
  }

  const used = new Set();
  const shares = sharesInput.map((share, index) => {
    const sharePath = typeof share === 'string' ? share : share.path;
    if (!sharePath) {
      throw new Error(`Share #${index + 1} is missing a "path".`);
    }
    const resolved = path.resolve(configDir, sharePath);
    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch {
      throw new Error(`Share folder does not exist: ${resolved}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Share path is not a folder: ${resolved}`);
    }
    const name = String(share.name || path.basename(resolved) || `Share ${index + 1}`);
    const id = uniqueShareId(share.id || name, used);
    return {
      id,
      name,
      description: String(share.description || ''),
      path: resolved,
      includeHidden: Boolean(share.includeHidden),
    };
  });

  const port = Number(args.port ?? fileConfig.port ?? env.DATA_SHORE_NODE_PORT ?? DEFAULTS.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${args.port ?? fileConfig.port}`);
  }

  const token = String(
    args.token || env.DATA_SHORE_NODE_TOKEN || fileConfig.token || newToken(),
  );

  return {
    help: false,
    configPath,
    name: String(args.name || fileConfig.name || DEFAULTS.name),
    port,
    host: String(args.host || env.DATA_SHORE_NODE_HOST || fileConfig.host || DEFAULTS.host),
    token,
    tokenGenerated: !(args.token || env.DATA_SHORE_NODE_TOKEN || fileConfig.token),
    publicUrl: String(args.publicUrl || env.DATA_SHORE_NODE_PUBLIC_URL || fileConfig.publicUrl || ''),
    hubUrl: String(args.hub || env.DATA_SHORE_HUB_URL || fileConfig.hubUrl || ''),
    shares,
    version: NODE_VERSION,
  };
}

export function helpText() {
  return `Data Shore node ${NODE_VERSION} — serve a folder as a read-only archive

Usage
  datashore-node --root <folder> [options]
  datashore-node --config datashore.node.json

Options
  --root <folder>        Folder to publish (quick single-share setup)
  --name <name>          Node name
  --config <file>        JSON config (default: ./datashore.node.json)
  --port <port>          Port (default 4770)
  --host <host>          Bind address (default 127.0.0.1)
  --token <token>        Access token (generated if omitted)
  --public-url <url>     Public URL used in the pairing code
  --hub <url>            Hub URL, only used in the printed pairing link
  --help                 Show this help

Config file
  {
    "name": "Home node",
    "port": 4770,
    "host": "127.0.0.1",
    "token": "dsn_…",
    "shares": [
      { "id": "tides", "name": "Atlas of Tides", "path": "/mnt/photos" }
    ]
  }

Security
  The node exposes GET endpoints only and never accepts writes. Bind to
  127.0.0.1 behind a tunnel, or to 0.0.0.0 on a trusted network.
`;
}

/** Best-effort LAN address so a pairing code works from another machine. */
export function guessedUrl(host, port, publicUrl) {
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  let address = host;
  if (host === '0.0.0.0' || host === '::') {
    address = '127.0.0.1';
    const nets = os.networkInterfaces();
    for (const entries of Object.values(nets)) {
      for (const net of entries || []) {
        if (net.family === 'IPv4' && !net.internal) {
          address = net.address;
          break;
        }
      }
      if (address !== '127.0.0.1') break;
    }
  }
  return `http://${address}:${port}`;
}

export function pairingCode(config) {
  const url = guessedUrl(config.host, config.port, config.publicUrl);
  const payload = {
    v: 1,
    kind: 'data-shore-node',
    name: config.name,
    url,
    token: config.token,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
