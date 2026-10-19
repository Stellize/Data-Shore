import fs from 'node:fs/promises';
import path from 'node:path';
import { extOf, isHiddenName, kindOf } from '@datashore/shared';
import { mimeForName } from './fsutil.js';

export const MAX_INDEX_ENTRIES = 500_000;

/**
 * Walk a share and build a lightweight in-memory catalog.
 * Symlinked folders are never followed (cycle safety); symlinked files are
 * included only when their target stays inside the share root.
 */
export async function buildIndex(share, { onProgress, shouldStop } = {}) {
  const started = Date.now();
  const files = [];
  const dirs = new Map(); // dirPath -> { path, name, size, files, mtimeMs }
  let scanned = 0;
  let bytes = 0;
  let truncated = false;
  let skipped = 0;

  let realRoot;
  try {
    realRoot = await share.realRootPromise;
  } catch {
    throw new Error(`Share folder is missing: ${share.root}`);
  }

  const isInsideRoot = (candidate) =>
    candidate === realRoot || candidate.startsWith(realRoot + path.sep);

  const stack = [{ absolute: realRoot, relative: '' }];
  const pendingStats = [];

  while (stack.length) {
    if (shouldStop?.()) break;
    const current = stack.pop();

    let dirents;
    try {
      dirents = await fs.readdir(current.absolute, { withFileTypes: true });
    } catch {
      skipped += 1;
      continue;
    }

    for (const dirent of dirents) {
      if (shouldStop?.()) break;
      if (!share.includeHidden && isHiddenName(dirent.name)) continue;
      const absolute = path.join(current.absolute, dirent.name);
      const relative = current.relative ? `${current.relative}/${dirent.name}` : dirent.name;

      if (dirent.isSymbolicLink()) {
        let real;
        try {
          real = await fs.realpath(absolute);
        } catch {
          skipped += 1;
          continue;
        }
        if (!isInsideRoot(real)) {
          skipped += 1;
          continue;
        }
        let stats;
        try {
          stats = await fs.stat(real);
        } catch {
          skipped += 1;
          continue;
        }
        if (stats.isDirectory()) {
          // Do not follow folder links: they can create cycles.
          skipped += 1;
          continue;
        }
        addFile(relative, dirent.name, stats);
        continue;
      }

      if (dirent.isDirectory()) {
        addDir(relative, dirent.name, absolute);
        stack.push({ absolute, relative });
        continue;
      }

      if (!dirent.isFile()) continue;

      let stats;
      try {
        stats = await fs.stat(absolute);
      } catch {
        skipped += 1;
        continue;
      }
      addFile(relative, dirent.name, stats);
    }

    if (onProgress && (scanned + dirs.size) % 750 < dirents.length) {
      onProgress({ scanned, files: files.length, bytes });
    }

    if (files.length + dirs.size >= MAX_INDEX_ENTRIES) {
      truncated = true;
      break;
    }
  }

  function addDir(relative, name, absolute) {
    const statsEntry = { path: relative, name, files: 0, bytes: 0, mtimeMs: 0 };
    dirs.set(relative, statsEntry);
    // fs.Dirent carries no mtime, so collect stats promises and await them
    // before the catalog is sealed.
    pendingStats.push(
      fs.stat(absolute)
        .then((stats) => {
          statsEntry.mtimeMs = stats.mtimeMs;
        })
        .catch(() => {}),
    );
  }

  function addFile(relative, name, stats) {
    const kind = kindOf(name);
    const slash = relative.lastIndexOf('/');
    const dirPath = slash === -1 ? '' : relative.slice(0, slash);
    files.push({
      path: relative,
      name,
      dir: dirPath,
      kind,
      ext: extOf(name),
      mime: mimeForName(name),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      mtime: new Date(stats.mtimeMs).toISOString(),
      lower: relative.toLowerCase(),
    });
    scanned += 1;
    bytes += stats.size;

    // Roll sizes up through every ancestor folder.
    let cursor = dirPath;
    while (true) {
      const dir = dirs.get(cursor);
      if (dir) {
        dir.files += 1;
        dir.bytes += stats.size;
        if (stats.mtimeMs > dir.mtimeMs) dir.mtimeMs = stats.mtimeMs;
      }
      if (!cursor) break;
      const index = cursor.lastIndexOf('/');
      cursor = index === -1 ? '' : cursor.slice(0, index);
    }
  }

  await Promise.all(pendingStats);

  const entries = [];
  const kindCounts = {};
  let latestMtimeMs = 0;

  for (const dir of dirs.values()) {
    entries.push({
      path: dir.path,
      name: dir.name,
      dir: dir.path.includes('/') ? dir.path.slice(0, dir.path.lastIndexOf('/')) : '',
      type: 'dir',
      kind: 'folder',
      ext: '',
      mime: null,
      size: dir.bytes,
      fileCount: dir.files,
      mtimeMs: dir.mtimeMs,
      mtime: new Date(dir.mtimeMs).toISOString(),
      lower: dir.path.toLowerCase(),
    });
  }

  for (const file of files) {
    entries.push({ ...file, type: 'file' });
    kindCounts[file.kind] = (kindCounts[file.kind] || 0) + 1;
    if (file.mtimeMs > latestMtimeMs) latestMtimeMs = file.mtimeMs;
  }

  const byPath = new Map(entries.map((entry) => [entry.path, entry]));

  return {
    shareId: share.id,
    entries,
    byPath,
    stats: {
      files: files.length,
      folders: dirs.size,
      bytes,
      skipped,
      kinds: kindCounts,
      latestMtime: latestMtimeMs ? new Date(latestMtimeMs).toISOString() : null,
      truncated,
      tookMs: Date.now() - started,
    },
  };
}
