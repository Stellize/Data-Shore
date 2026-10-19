<div align="center">

<img src="apps/web/public/favicon.svg" width="72" alt="Data Shore logo" />

# Data Shore

**A read-only shore for your drives.**

Turn any folder or mounted drive into a calm public archive. Visitors can browse, stream, and
download — nobody can write, edit, or delete. Your files never leave your machine.

[Quick start](#quick-start) · [How it works](#how-it-works) · [Production setup](#production-setup) · [API](#api-reference) · [Security](#the-read-only-guarantee)

</div>

---

## Why this exists

Tools like Google Drive, AList, and OnlineArchive are excellent at syncing and sharing, but they
usually assume the web is another drive: upload here, rename there, delete if you change your
mind. When all you want is for people to **see** an archive, every write path is a risk you did
not ask for.

Data Shore is built the other way around. It has two halves:

| | What it is | What it does |
| --- | --- | --- |
| **Node** | A small process beside your files | Serves one or more folders over a **GET-only** API, with token auth, a path jail, and byte-range streaming |
| **Hub** | A website + console | Keeps a searchable catalog, proxies streams through its own doorway, and lets a curator pair nodes |

The hub stores **names, sizes, and dates — never file contents**. Bytes are pulled from your node
only when someone presses play or download. If the node goes offline, the catalog stays readable
but media stops; if the hub is compromised, there is still no write endpoint to reach.

## What you get

- **A public archive site** with editorial layout, featured archives, tags, curators, and
  per-archive pages.
- **A file browser** with folders, grid/list views, media filters, and breadcrumbs.
- **A real media viewer** for images, video (byte-range seeking), audio, PDF, Markdown, plain
  text, code, CSV/TSV tables, and JSON. Everything else downloads.
- **Full-text-catalog search** across names and paths, with `kind:video`, `ext:pdf`, and
  `folder:notes` filters — globally and per archive.
- **A curator console** to pair nodes by pairing code, publish one share as one archive,
  edit public labels, toggle downloads, feature an archive, or list it as unlisted.
- **Sync state you can trust**: per-archive progress, last-synced time, explicit errors, and a
  stale catalog that keeps serving when the node is unreachable.
- **A demo shore** with original photographs, essays, tide tables, field recordings, and a short
  film — all served through the same code as production.

## Quick start

Requires **Node 20 or newer**.

```bash
git clone https://github.com/Stellize/Data-Shore.git
cd Data-Shore
npm install
npm run demo
```

Then open:

- **Site** — <http://localhost:8787>
- **Console** — <http://localhost:8787/console> (password: `shore`)

The demo starts a real archive node over `demo/tide-atlas` and `demo/harbor-sessions`, pairs it,
and catalogs both folders. There are no mocked endpoints.

> The demo is for local viewing. Do not expose demo mode to the public internet.

## How it works

```
      your machine                               your server                    visitors
 ┌──────────────────────┐                  ┌───────────────────────┐        ┌──────────────┐
 │  folder / mounted    │   GET + token    │  Data Shore hub       │  HTTP  │  browser     │
 │  drive               │ ◄─────────────── │  • public catalog     │ ◄───── │  browse      │
 │  ┌────────────────┐  │   catalog pages  │  • search             │        │  stream      │
 │  │ Data Shore node│  │   byte ranges    │  • streaming proxy    │        │  download    │
 │  │ GET only       │  │ ───────────────► │  • curator console    │        │  no account  │
 │  │ path jail      │  │   media bytes    │  • signed sessions    │        └──────────────┘
 │  └────────────────┘  │                  └───────────────────────┘
 └──────────────────────┘
```

1. The **node** scans a share once, then answers `/api/*` and `/stream/*` with a bearer token.
2. The **console** inspects the node, publishes a share as an archive, and the hub copies the
   catalog (paths, sizes, dates, types).
3. The **public site** reads only the hub's catalog. File requests are checked against that
   catalog and proxied to the node, which streams the exact byte range requested.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full internals and data shapes.

## The read-only guarantee

Read-only is not a checkbox in this project; it is the shape of every layer.

| Layer | What prevents writes |
| --- | --- |
| Node HTTP surface | Any method other than `GET`/`HEAD` is answered `405` before reaching the filesystem. There are no upload, rename, or delete routes. |
| Node filesystem | Paths are normalized, joined to the share root, `realpath`-checked, and rejected on escape. Hidden files, device files, and symlinks that leave the share are skipped. |
| Node media | Active content (`html`, `svg`, `xml`) is served as `text/plain` or as an attachment with a sandboxing CSP and `nosniff`. |
| Hub credentials | Node tokens live only on the hub. Public JSON responses are stripped of source URLs and tokens. |
| Hub streaming | A requested path must exist in the hub's own catalog before any proxy request is made. Downloads can be switched off per archive. |
| Hub console | Signed HTTP-only sessions, SameSite cookies, a CSRF header check on every mutation, login rate limiting, and no default password in production. |
| Deployment | The provided Docker node mounts your archive read-only (`:ro`), so even a hypothetical bug has no write permission. |

What read-only does **not** mean: it is not encryption, DRM, or a private sharing system. Any
visitor can read and (unless disabled) download what you publish. Unlisted archives are hidden
from lists and search, not access-controlled. See [Security notes](#security-notes).

## Production setup

### 1. Install on both machines

```bash
git clone https://github.com/Stellize/Data-Shore.git
cd Data-Shore
npm install
npm run build          # on the machine that will host the hub
```

### 2. Start the node beside your files

Create a config (or copy `apps/node/datashore.example.json`):

```json
{
  "name": "Home archive node",
  "port": 4770,
  "host": "127.0.0.1",
  "token": "use-a-long-random-string",
  "shares": [
    {
      "id": "photographs",
      "name": "Photographs",
      "description": "Film scans, sorted by season.",
      "path": "/Volumes/Archive/Photographs"
    }
  ]
}
```

```bash
npx datashore-node --config /path/to/datashore.node.json
# or, from this repo:
npm run start:node -- --config ./datashore.node.json
```

The terminal prints a **pairing code** and the token. Keep the process running while the archive
should be reachable. For quick trials, `--root "/some/folder" --name "Home archive"` also works.

### 3. Expose the node privately

Prefer a private tunnel over an open port:

- **Tailscale** — give the hub machine access to the node's tailnet address.
- **Cloudflare Tunnel** — publish the node behind an authenticated hostname.
- **Reverse proxy with TLS and an allowlist** — only allow the hub's IP.

Put the tunnel URL in the node config as `publicUrl` so the pairing code points at it.

### 4. Start the hub and pair

```bash
DATA_SHORE_ADMIN_PASSWORD="a long unique console password" npm start
```

Then open `/console`, sign in, choose **Pair a node**, paste the pairing code, pick a share,
write a title and description, and publish. The node indexes in the background; the console shows
progress and turns the archive live when the catalog is ready. Press **Sync now** after adding
files to the folder.

### Deployment options

- **Docker Compose** — `docker compose up --build` starts a hub and a node with your archive
  mounted read-only. Before starting, edit `docker/node.datashore.json` (token) and set
  `DATA_SHORE_ADMIN_PASSWORD` in the environment or a `.env` file. Put files in
  `docker/archive/`.
- **Systemd, Caddy, Nginx, backup notes** — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Configuration

### Node (`datashore.node.json`)

| Key | Default | Notes |
| --- | --- | --- |
| `name` | `Data Shore node` | Shown in the console when pairing |
| `port` / `host` | `4770` / `127.0.0.1` | Use `0.0.0.0` only on a trusted network |
| `token` | generated each run | Set it to keep pairing stable across restarts |
| `publicUrl` | guessed LAN address | URL embedded in the pairing code |
| `hubUrl` | — | Informational only |
| `shares[]` | required | `{ id, name, description, path, includeHidden }` |

CLI flags: `--root`, `--name`, `--port`, `--host`, `--token`, `--config`, `--public-url`,
`--hub`, `--help`.

### Hub (environment)

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8787` | Public port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_SHORE_ADMIN_PASSWORD` | generated and printed once | Console password |
| `DATA_SHORE_HUB_DATA` | `apps/hub/data` | Database, session secret, catalogs |
| `DATA_SHORE_WEB_DIR` | `apps/web/dist` | Built site |
| `DATA_SHORE_DEMO` | unset | `1` enables demo affordances |

The hub database is a single `hub.json` plus one catalog file per archive. Back up that directory;
it contains node tokens, so treat it as a secret.

## API reference

All node endpoints require `Authorization: Bearer <token>`; `/api/health` is public. Media URLs
also accept `?token=` because `<img>` and `<video>` cannot set headers.

| Method | Node | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, protocol version, node name |
| `GET` | `/api/pair` | Node metadata and share list for pairing |
| `GET` | `/api/stats/:share` | Catalog readiness and totals |
| `GET` | `/api/index/:share` | Start or refresh indexing (`202`) |
| `GET` | `/api/entries/:share` | Paged catalog (`offset`, `limit`) |
| `GET` | `/api/browse/:share?path=` | Live folder listing |
| `GET` | `/api/search/:share?q=` | Search with `kind:`, `ext:`, `type:`, `folder:` |
| `GET` | `/api/file/:share?path=` | File metadata |
| `GET` | `/stream/:share?path=` | File bytes with ranges; `download=1` forces attachment |

| Method | Hub | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/hub` | public | Hub settings and totals |
| `GET` | `/api/archives` | public | Listed archives |
| `GET` | `/api/archives/:slug` | public | Archive detail, root listing, highlights |
| `GET` | `/api/archives/:slug/browse?path=` | public | Folder listing |
| `GET` | `/api/archives/:slug/search?q=` | public | Per-archive search |
| `GET` | `/api/archives/:slug/file?path=` | public | File metadata |
| `GET` | `/api/archives/:slug/stream?path=` | public | Proxied bytes with ranges |
| `GET` | `/api/search?q=` | public | Cross-archive search |
| `POST` | `/api/console/session` | password | Sign in (sets HTTP-only cookie) |
| `GET` | `/api/console/overview` | session | Archives, sync state, activity, settings |
| `POST` | `/api/console/inspect` | session | Validate a pairing code / node credentials |
| `POST` | `/api/console/archives` | session | Publish a share as an archive |
| `PATCH` | `/api/console/archives/:id` | session | Edit labels, visibility, downloads, `coverPath` |
| `GET` | `/api/console/archives/:id/covers` | session | Candidate cover images and the automatic pick |
| `POST` | `/api/console/archives/:id/sync` | session | Re-read the node catalog |
| `DELETE` | `/api/console/archives/:id` | session | Remove the archive and its catalog |
| `PATCH` | `/api/console/settings` | session | Hub name, tagline, intro, announcement |

Every console mutation requires the `X-DataShore-Request: 1` header and a same-origin `Origin` when
one is present.

## Project layout

```
apps/
  node/                 archive node (Express, no writes)
    src/config.js       config loading, pairing code
    src/fsutil.js       path jail, listings, metadata
    src/indexer.js      in-memory catalog builder
    src/stream.js       range/conditional streaming
    src/app.js          GET-only HTTP surface
  hub/                  public hub + console API
    src/store.js        hub.json persistence
    src/catalog.js      catalog files, browsing, search
    src/sync.js         node → hub catalog sync service
    src/node-client.js  node API client, pairing codes
    src/app.js          public API, admin API, streaming proxy
  web/                  React site and console (Vite)
    src/pages/          home, archives, archive, search, about
    src/console/        console shell, pairing, management, settings
    src/components/     viewer, covers, file tiles, search, modals
packages/shared/        file kinds, formatting, path normalization
demo/                   the sample shore (original content)
scripts/demo.mjs        one-command demo
docs/                   architecture and deployment notes
```

## Development

```bash
npm run dev:hub     # hub API + built site on :8787
npm run dev:web     # Vite dev server on :5173, proxies /api to :8787
npm run test        # API suites (node:test) + UI suites (Vitest)
npm run test:api
npm run test:ui
```

The test suites cover traversal and symlink escapes, symlink listing, token scoping, all write
methods, range and conditional requests, active-content handling, hub pairing, CSRF, unlisted
archives, download policy, resync, deletion, catalog truncation, and component rendering for every
public page and console view.

## Limits worth knowing

- The node keeps its catalog in memory. It indexes up to **500,000 entries** per share; the hub
  stores up to **250,000** and marks larger catalogs as truncated.
- Folders are not followed through symlinks (cycle safety). File symlinks are included only when
  they resolve inside the share.
- The hub keeps the **latest** catalog. Deletions appear after a sync; there is no version history.
- Archive slugs are fixed at creation so links stay stable; titles can change freely.
- There is no built-in visitor auth, comments, or analytics. Unlisted means "not listed", not
  "protected".
- Demo assets, including generated photographs and audio, are sample material for this repository
  and are not a license to redistribute them separately.

## Security notes

- Always run the hub behind HTTPS; session cookies are marked `Secure` when the request is.
- Use a long, unique `DATA_SHORE_ADMIN_PASSWORD` and a long, random node token.
- Keep the hub data directory private: it stores node tokens.
- Do not expose a node's raw port to the internet. Use a tunnel or an authenticated proxy.
- A node token grants read access to every share on that node. Run separate nodes when shares
  need separate trust boundaries.
- Report security issues privately rather than opening a public issue.

## Roadmap

Ideas that fit the design: resumable sync for very large catalogs, optional per-archive visitor
passphrases, WebDAV-style ranged reads for desktop clients, thumbnail generation on the node, and
a static "read-only" mode that exports the hub catalog without live streaming. Write endpoints are
not on the roadmap.

## License

[MIT](LICENSE) © 2026 Ameliaz
