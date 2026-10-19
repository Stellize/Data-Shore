# Deployment notes

These are starting points, not the only way to run Data Shore. Replace paths, users, and domains
to match your machine.

## Ports and topology

| Process | Default | Exposure |
| --- | --- | --- |
| Hub | `8787` | Public, behind HTTPS |
| Node | `4770` | Private: LAN, tailnet, or authenticated tunnel |

The hub needs outbound HTTP(S) access to every node it pairs. The node accepts only `GET`/`HEAD`
and needs no outbound access.

## Node behind a tunnel

If you use Cloudflare Tunnel, point a hostname at `http://127.0.0.1:4770` and add an access policy
so only your hub can reach it. Put the public hostname in the node config:

```json
{
  "publicUrl": "https://archive-node.example.com",
  "host": "127.0.0.1"
}
```

The pairing code will then contain the tunnel URL. With Tailscale, use the machine's tailnet name
instead and keep `host` at `127.0.0.1` or the tailnet interface.

Do not set `host` to `0.0.0.0` on an untrusted network. The token is strong, but TLS and network
isolation are still your responsibility.

## systemd: node

`/etc/systemd/system/datashore-node.service`

```ini
[Unit]
Description=Data Shore archive node
After=network-online.target

[Service]
Type=simple
User=archive
WorkingDirectory=/srv/datashore
ExecStart=/usr/bin/node apps/node/src/index.js --config /etc/datashore/node.json
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=/mnt/archive
# The node needs no write access outside its own working directory.
ReadWritePaths=/srv/datashore

[Install]
WantedBy=multi-user.target
```

Note `ReadOnlyPaths` for the share. This is belt-and-braces: the app cannot write, and the kernel
would refuse anyway.

## systemd: hub

`/etc/systemd/system/datashore-hub.service`

```ini
[Unit]
Description=Data Shore hub
After=network-online.target

[Service]
Type=simple
User=datashore
WorkingDirectory=/srv/datashore
Environment=PORT=8787
Environment=DATA_SHORE_HUB_DATA=/var/lib/datashore
Environment=DATA_SHORE_WEB_DIR=/srv/datashore/apps/web/dist
EnvironmentFile=/etc/datashore/hub.env
ExecStart=/usr/bin/node apps/hub/src/index.js
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/datashore

[Install]
WantedBy=multi-user.target
```

`/etc/datashore/hub.env` (mode `0600`):

```bash
DATA_SHORE_ADMIN_PASSWORD=replace-with-a-long-random-password
```

## Caddy reverse proxy

```caddy
shore.example.com {
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    reverse_proxy 127.0.0.1:8787
}
```

Caddy handles certificates. If you put the hub behind another proxy, make sure it forwards
`X-Forwarded-Proto`; the hub uses it to mark session cookies `Secure`.

## Nginx reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name shore.example.com;

    client_max_body_size 1m;          # no uploads, but keep requests small anyway
    proxy_read_timeout 300s;          # long media streams and big syncs

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;          # let media flow
    }
}
```

## Backups

Back up the hub data directory:

```
apps/hub/data/hub.json          labels, tokens, counters, settings
apps/hub/data/catalogs/*.json   catalog per archive (rebuildable via sync)
apps/hub/data/session-secret    invalidates sessions if lost (harmless)
```

A nightly copy is enough. The data directory contains **node tokens**, so encrypt the backup and
restrict access. Your actual files are not in this directory and do not need a Data Shore backup;
use whatever backup you already trust for the drive itself.

## Upgrades

```bash
git pull
npm install
npm run build
sudo systemctl restart datashore-hub
sudo systemctl restart datashore-node
```

The database is versioned (`version: 1`) and additive. If a future release changes the schema, the
release notes will describe the migration.

## Scaling notes

- One hub comfortably serves a personal or small-community archive. Media is proxied, so hub
  bandwidth equals viewer bandwidth.
- For many concurrent viewers, put a CDN in front of `/api/archives/*/stream` only if you accept
  that it caches archive bytes; range responses are cache-friendly (`206`, `ETag`).
- Separate trust boundaries mean separate nodes: a token grants read access to every share on its
  node.
- Very large catalogs (100k+ entries) increase sync time and hub memory. The hub caps at 250k
  entries and marks the archive truncated; split collections into shares to stay under it.
