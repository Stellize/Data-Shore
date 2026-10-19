import fs from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';
import {
  extOf,
  kindOf,
  isActiveExtension,
  isHiddenName,
  normalizeArchivePath,
} from '@datashore/shared';

export class NodeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function makeShare(share) {
  const root = path.resolve(share.path);
  return {
    ...share,
    root,
    realRootPromise: fs.realpath(root),
  };
}

/**
 * Resolve a user-supplied relative path inside a share.
 * Defends against `..`, absolute paths, null bytes and symlinks that
 * point outside the share's real root.
 */
export async function resolveInShare(share, input, { allowMissing = false } = {}) {
  const normalized = normalizeArchivePath(input);
  if (normalized === null) {
    throw new NodeError(400, 'INVALID_PATH', 'That path is not allowed.');
  }

  const joined = path.resolve(share.root, normalized);
  if (!isInside(share.root, joined)) {
    throw new NodeError(403, 'PATH_ESCAPE', 'That path escapes the share.');
  }

  let realRoot;
  try {
    realRoot = await share.realRootPromise;
  } catch {
    throw new NodeError(503, 'SHARE_MISSING', 'The share folder is not available.');
  }

  let real;
  try {
    real = await fs.realpath(joined);
  } catch (err) {
    if (err.code === 'ENOENT' && allowMissing) {
      return { normalized, absolute: joined, real: joined, exists: false };
    }
    if (err.code === 'ENOENT') {
      throw new NodeError(404, 'NOT_FOUND', 'That file or folder does not exist.');
    }
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new NodeError(403, 'ACCESS_DENIED', 'The node cannot read that path.');
    }
    throw err;
  }

  if (!isInside(realRoot, real)) {
    throw new NodeError(403, 'PATH_ESCAPE', 'That path points outside the share.');
  }

  return { normalized, absolute: joined, real, exists: true };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function safeMime(name, ext) {
  const base = mime.lookup(name) || 'application/octet-stream';
  if (isActiveExtension(ext)) {
    return ext === 'svg' ? 'image/svg+xml' : 'text/plain; charset=utf-8';
  }
  if (base.startsWith('text/')) return `${base}; charset=utf-8`;
  return base;
}

export function entryFromStat(name, relPath, stats, isSymlink = false) {
  const kind = stats.isDirectory() ? 'folder' : kindOf(name);
  const ext = stats.isDirectory() ? '' : extOf(name);
  return {
    name,
    path: relPath,
    type: stats.isDirectory() ? 'dir' : 'file',
    kind,
    ext,
    mime: stats.isDirectory() ? null : safeMime(name, ext),
    size: stats.isDirectory() ? null : stats.size,
    mtime: stats.mtime.toISOString(),
    isSymlink,
  };
}

const MAX_ENTRIES = 2500;

export async function listDirectory(share, normalizedPath) {
  const target = await resolveInShare(share, normalizedPath);
  const stats = await fs.stat(target.real);
  if (!stats.isDirectory()) {
    throw new NodeError(400, 'NOT_A_FOLDER', 'That path is a file, not a folder.');
  }

  let dirents;
  try {
    dirents = await fs.readdir(target.real, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new NodeError(403, 'ACCESS_DENIED', 'The node cannot read that folder.');
    }
    throw err;
  }

  dirents = dirents.filter((entry) => {
    if (!share.includeHidden && isHiddenName(entry.name)) return false;
    return true;
  });

  const truncated = dirents.length > MAX_ENTRIES;
  if (truncated) dirents = dirents.slice(0, MAX_ENTRIES);

  const entries = await mapLimit(dirents, 24, async (entry) => {
    const relPath = normalizedPath ? `${normalizedPath}/${entry.name}` : entry.name;
    const absolute = path.join(target.real, entry.name);
    try {
      if (entry.isSymbolicLink()) {
        // Never expose a link that resolves outside the share, even if the
        // link target itself is readable.
        const real = await fs.realpath(absolute);
        const realRoot = await share.realRootPromise;
        if (!isInside(realRoot, real)) return null;
        const linkedStats = await fs.stat(real);
        if (linkedStats.isDirectory()) return null;
        return entryFromStat(entry.name, relPath, linkedStats, true);
      }
      const entryStats = await fs.stat(absolute);
      return entryFromStat(entry.name, relPath, entryStats, false);
    } catch {
      return null;
    }
  });

  const files = entries.filter(Boolean);
  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return collator.compare(a.name, b.name);
  });

  let bytes = 0;
  let fileCount = 0;
  for (const entry of files) {
    if (entry.type === 'file') {
      bytes += entry.size || 0;
      fileCount += 1;
    }
  }

  return {
    path: normalizedPath,
    entries: files,
    truncated,
    summary: { files: fileCount, bytes },
  };
}

export async function statInShare(share, input) {
  const target = await resolveInShare(share, input);
  const stats = await fs.stat(target.real);
  if (stats.isDirectory()) {
    throw new NodeError(400, 'IS_FOLDER', 'That path is a folder.');
  }
  const name = path.basename(target.normalized);
  return {
    ...entryFromStat(name, target.normalized, stats),
    mtimeMs: stats.mtimeMs,
    absolute: target.real,
  };
}

export function mimeForName(name) {
  const ext = extOf(name);
  return safeMime(name, ext);
}
