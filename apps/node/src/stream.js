import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { isActiveExtension } from '@datashore/shared';

export function etagFor(size, mtimeMs) {
  return `"${Number(size).toString(16)}-${Math.floor(Number(mtimeMs)).toString(16)}"`;
}

/**
 * Parse a single-range `bytes=` header.
 * @returns {null | {start:number,end:number} | {unsatisfiable:true}}
 */
export function parseRange(header, size) {
  if (!header || typeof header !== 'string') return null;
  const match = /^bytes=(.+)$/i.exec(header.trim());
  if (!match) return null;
  const spec = match[1].trim();
  if (spec.includes(',')) return null; // multiple ranges: serve the whole file
  const range = /^(\d*)-(\d*)$/.exec(spec);
  if (!range) return null;

  const [, rawStart, rawEnd] = range;
  if (!rawStart && !rawEnd) return null;

  let start;
  let end;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return { unsatisfiable: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (end < start) return { unsatisfiable: true };
    end = Math.min(end, size - 1);
  }

  if (size === 0 || start >= size) return { unsatisfiable: true };
  return { start, end };
}

function contentDisposition(name, type) {
  const fallback = String(name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function ifRangeMatches(header, etag, mtimeMs) {
  if (!header) return true;
  const value = header.trim();
  if (value.startsWith('"') || value.startsWith('W/')) {
    return value === etag;
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) return false;
  return Math.floor(mtimeMs / 1000) <= Math.floor(date / 1000);
}

export function fileHeaders({ name, size, mtimeMs, mime, ext, download }) {
  const active = isActiveExtension(ext);
  const inline = !download && !(active && ext !== 'svg');
  return {
    'Content-Type': mime,
    'Content-Disposition': contentDisposition(name, inline ? 'inline' : 'attachment'),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=120, no-transform',
    ...(active
      ? {
          'Content-Security-Policy':
            "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:",
        }
      : {}),
  };
}

export async function sendFile(req, res, file) {
  const { absolute, name, size, mtimeMs, mime, ext } = file;
  const etag = etagFor(size, mtimeMs);
  const lastModified = new Date(mtimeMs).toUTCString();
  const download = req.query.download === '1' || req.query.download === 'true';

  const baseHeaders = {
    ...fileHeaders({ name, size, mtimeMs, mime, ext, download }),
    ETag: etag,
    'Last-Modified': lastModified,
  };
  for (const [key, value] of Object.entries(baseHeaders)) res.setHeader(key, value);

  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];
  const cacheHit =
    (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) ||
    (!ifNoneMatch && ifModifiedSince && Date.parse(ifModifiedSince) >= Math.floor(mtimeMs / 1000) * 1000);

  if (cacheHit) {
    res.statusCode = 304;
    res.removeHeader('Content-Type');
    res.removeHeader('Content-Disposition');
    res.end();
    return;
  }

  let range = null;
  const rangeHeader = req.headers.range;
  if (rangeHeader && ifRangeMatches(req.headers['if-range'], etag, mtimeMs)) {
    range = parseRange(rangeHeader, size);
  }

  if (range && range.unsatisfiable) {
    res.statusCode = 416;
    res.setHeader('Content-Range', `bytes */${size}`);
    res.end();
    return;
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : Math.max(0, size - 1);
  const length = size === 0 ? 0 : end - start + 1;

  res.statusCode = range ? 206 : 200;
  res.setHeader('Content-Length', length);
  if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);

  if (req.method === 'HEAD' || size === 0) {
    res.end();
    return;
  }

  const stream = fs.createReadStream(absolute, { start, end });
  try {
    await pipeline(stream, res);
  } catch (err) {
    if (!['ERR_STREAM_PREMATURE_CLOSE', 'EPIPE', 'ECONNRESET'].includes(err.code)) {
      // The response may already be underway; log and let the connection close.
      console.error(`[stream] ${name}: ${err.message}`);
    }
  }
}
