# Architecture

Data Shore is two deployable processes and one browser app. This document explains how they
fit together, what each stores, and where the read-only guarantees live in the code.

```
 packages/shared     file kinds · formatting · path normalization (used by everything)
 apps/node           Express server that owns filesystem access
 apps/hub            Express server that owns the public catalog and console
 apps/web            React 18 + Vite SPA (public site + console)
```

## The node

The node is the only component that touches the filesystem. It is deliberately small.

### Configuration

`apps/node/src/config.js` loads a JSON file (or `--root` shortcut), validates that every share
folder exists, assigns stable share IDs, and resolves a token. If no token is configured, one is
generated for the run and printed. The printed **pairing code** is base64url JSON:

```json
{ "v": 1, "kind": "data-shore-node", "name": "…", "url": "http://…", "token": "dsn_…" }
```

### Indexing

`apps/node/src/indexer.js` walks each share with an iterative DFS, skipping hidden names, device
files, and symlinked folders. File symlinks are included only when `realpath` stays inside the
share. It records:

```js
{ path, name, dir, type, kind, ext, mime, size, mtime, mtimeMs }
```

Folder entries aggregate `fileCount`, `bytes`, and the newest descendant mtime. The catalog is
kept in memory and capped at 500,000 entries per share. Indexing is started on boot and can be
triggered or refreshed by the hub.

### Serving

`apps/node/src/app.js` mounts five things:

1. **Method gate** — every request that is not `GET`/`HEAD` is answered `405 READ_ONLY` with
   `Allow: GET, HEAD`. This runs before authentication so the surface is uniform.
2. **Auth** — `/api/*` and `/stream/*` require `Authorization: Bearer <token>`. Media URLs may
   also use `?token=` for `<img>`/`<video>`. API routes ignore query tokens. Failed attempts are
   rate-limited per IP.
3. **Path jail** — `apps/node/src/fsutil.js#resolveInShare` normalizes the path, rejects null
   bytes, resolves the share root once via `realpath`, resolves the request target, and refuses
   anything not inside the real root.
4. **Metadata and search** — paged catalog entries, live directory listings, and a scored
   name/path search with `kind:`, `ext:`, `type:`, and `folder:` filters.
5. **Streaming** — `apps/node/src/stream.js` implements `Range`, `If-Range`, `If-None-Match`,
   `If-Modified-Since`, `HEAD`, `416`, and `ETag`. Files are streamed with backpressure via
   `stream.pipeline`.

Active content is handled at the response layer: `.html`, `.htm`, `.xml`, and similar files are
served as `text/plain` (or as an attachment when downloading) with
`Content-Security-Policy: sandbox; default-src 'none'`. SVG is allowed to render as an image but
is also sandboxed; the hub's own CSP forbids inline script.

## The hub

The hub is a catalog, a doorway, and a console.

### Data

`apps/hub/data/` contains:

| File | Contents |
| --- | --- |
| `hub.json` | Settings, archives (labels, source URL, token, stats, counters), and a short activity log |
| `catalogs/<id>.json` | The full entry list for one archive, plus cover path and sync timestamp |
| `session-secret` | 32 random bytes, mode `0600`, used to HMAC console sessions |

Writes are atomic (`writeFile` + `rename`). The store debounces counter updates and writes
immediately for structural changes.

### Pairing and sync

`apps/hub/src/node-client.js` validates pairing codes, normalizes node URLs, and wraps fetch with
timeouts and friendly errors. `apps/hub/src/sync.js` implements one sync per archive:

```
stats → index trigger → poll stats → page /api/entries → write catalog → mark archive live
```

If a sync fails, the previous catalog stays on disk and continues serving; the archive is marked
`error` with a message shown in the console. Syncs are cancellable (used on delete) and
idempotent. Catalogs are capped at 250,000 entries and flagged `truncated` beyond that.

### Public API

Public routes read the stored catalog only. A file path must be present in the catalog before the
hub will proxy it — the node is never asked about arbitrary paths from the internet.

Covers are resolved in one place (`decorateArchive`). At sync time the hub records an automatic
cover (`catalog.coverPath`: the largest recent image); a curator can override it from the console
with any image in the catalog. The stored `archive.coverPath` is only used when it still exists and
is still an image, so deleting or re-sharing files degrades gracefully back to the automatic pick.
`GET /api/console/archives/:id/covers` returns up to 72 candidate images (largest first) for the
picker, and `PATCH /api/console/archives/:id` rejects anything else with `400 COVER_NOT_FOUND`. The proxy
filters request headers to `Range`, `If-Range`, `If-None-Match`, and `If-Modified-Since`, and
forwards only a safe subset of response headers. Response bodies are piped with backpressure and
aborted if the client disconnects.

### Console security

- Password comparison uses `timingSafeEqual`.
- A successful login sets `ds_session=<expiry>.<hmac>` as an HTTP-only, SameSite=Lax cookie
  (Secure when the request is HTTPS). Seven-day expiry.
- Mutations require `X-DataShore-Request: 1` and, when `Origin` is present, a same-origin `Origin`.
- Login attempts are limited per IP (12 per five minutes).
- Public JSON never includes `source.token` or `source.url`.

### SPA delivery

The built app is served from `apps/web/dist`. Hashed assets are immutable for a year; every other
path returns `index.html` with a strict CSP (`default-src 'self'`, no inline script). If the build
is missing, the hub returns an instructive 503 page rather than a blank screen.

## The web app

`apps/web` is React 18 with React Router and Vite. It has two trees:

- **Public** (`pages/`): home, archive index, archive browser + viewer, global search, about,
  not-found. Covers come from the archive stream; a generated contour illustration stands in when
  there is no usable image.
- **Console** (`console/`): login, overview with pairing flow, archive management, settings.

The viewer is the most complex component. It renders images, video, audio, and PDFs natively,
fetches text/code/CSV/JSON itself (2 MB cap), renders Markdown through `marked` +
`DOMPurify`, shows active content as plain text with a warning, and offers download for anything
else. Arrow keys move through the files currently visible in the folder or search result set.

## Performance notes

- Directory listings on the node are live `stat` calls with a concurrency of 24, capped at 2,500
  entries per folder.
- Catalog pages are 2,000 entries; a sync is a handful of requests for most archives.
- Search is a linear scan with early score pruning — fine to roughly 100k entries per archive in a
  browser-facing service, and deliberately simple.
- Media is never buffered whole by the hub: streams are piped, and ranges are forwarded.

## Failure modes

| Failure | Behavior |
| --- | --- |
| Node offline | Public catalog still browses; stream returns 502 with a clear message; console shows the error after a sync attempt |
| Node token rotated | Sync and streams fail with `401`; re-pair or update the token in the console (delete and re-publish) |
| Hub restarted mid-sync | Archive is marked `error` on load with "interrupted by a hub restart"; previous catalog remains |
| Share folder removed | Node marks the share missing; indexing and listings return `503`/`404` |
| Disk full on hub | Catalog write fails; sync reports the error and the old catalog stays live |

## Deliberate non-goals

Uploads, renames, deletes, collaborative editing, comments, and any "sync back to the drive"
feature. Data Shore is a reading room, not a drive.
