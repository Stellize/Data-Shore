import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeArchivePath } from '@datashore/shared';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function publicEntry(entry) {
  const { lower, mtimeMs, ...rest } = entry;
  return rest;
}

export function pickCover(entries) {
  const images = entries.filter((entry) => entry.type === 'file' && entry.kind === 'image');
  if (!images.length) return null;
  images.sort((a, b) => (b.size || 0) - (a.size || 0));
  const substantial = images.filter((entry) => (entry.size || 0) > 30_000);
  const pool = substantial.length ? substantial : images;
  pool.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  return pool[0].path;
}

export class CatalogStore {
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
    this.loading = new Map();
  }

  file(archiveId) {
    return path.join(this.dir, `${archiveId}.json`);
  }

  async load(archiveId) {
    if (this.cache.has(archiveId)) return this.cache.get(archiveId);
    if (this.loading.has(archiveId)) return this.loading.get(archiveId);
    const promise = (async () => {
      try {
        const raw = await fs.readFile(this.file(archiveId), 'utf8');
        const payload = JSON.parse(raw);
        if (!Array.isArray(payload.entries)) return null;
        const index = {
          ...payload,
          byPath: new Map(payload.entries.map((entry) => [entry.path, entry])),
        };
        for (const entry of index.entries) {
          if (!entry.lower) entry.lower = entry.path.toLowerCase();
        }
        this.cache.set(archiveId, index);
        return index;
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        return null;
      } finally {
        this.loading.delete(archiveId);
      }
    })();
    this.loading.set(archiveId, promise);
    return promise;
  }

  async save(archiveId, payload) {
    await fs.mkdir(this.dir, { recursive: true });
    const temp = path.join(this.dir, `${archiveId}.${Date.now()}.tmp`);
    await fs.writeFile(temp, JSON.stringify(payload));
    await fs.rename(temp, this.file(archiveId));
    this.cache.delete(archiveId);
  }

  async remove(archiveId) {
    this.cache.delete(archiveId);
    try {
      await fs.unlink(this.file(archiveId));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
}

export function breadcrumbsFor(archiveSlug, folderPath) {
  const crumbs = [{ name: 'Archive', path: '' }];
  if (!folderPath) return crumbs;
  let cursor = '';
  for (const segment of folderPath.split('/')) {
    cursor = cursor ? `${cursor}/${segment}` : segment;
    crumbs.push({ name: segment, path: cursor });
  }
  return crumbs;
}

export async function browseArchive(store, archive, rawPath) {
  const normalized = normalizeArchivePath(rawPath ?? '');
  if (normalized === null) {
    const error = new Error('That folder path is not allowed.');
    error.status = 400;
    error.code = 'INVALID_PATH';
    throw error;
  }
  const catalog = await store.load(archive.id);
  if (!catalog) return null;

  let folder = null;
  if (normalized) {
    folder = catalog.byPath.get(normalized);
    if (!folder || folder.type !== 'dir') {
      const error = new Error('That folder does not exist in this archive.');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
  }

  const children = sortEntries(
    catalog.entries.filter((entry) => entry.dir === normalized).map(publicEntry),
  );
  let directFiles = 0;
  let directBytes = 0;
  for (const child of children) {
    if (child.type === 'file') {
      directFiles += 1;
      directBytes += child.size || 0;
    }
  }

  return {
    path: normalized,
    folder: folder ? publicEntry(folder) : null,
    breadcrumbs: breadcrumbsFor(archive.slug, normalized),
    entries: children,
    summary: {
      files: folder?.fileCount ?? archive.stats.files,
      bytes: folder?.size ?? archive.stats.bytes,
      directFiles,
      directBytes,
    },
  };
}

export function catalogFile(catalog, archive, filePath) {
  const normalized = normalizeArchivePath(filePath ?? '');
  if (!normalized || normalized === null) return null;
  const entry = catalog?.byPath.get(normalized);
  if (!entry || entry.type !== 'file') return null;
  return entry;
}

function parseFilters(rawQuery) {
  const filters = {};
  const words = [];
  for (const token of String(rawQuery || '').trim().split(/\s+/).filter(Boolean)) {
    const match = /^(kind|ext|type|folder):(.+)$/i.exec(token);
    if (match) {
      const key = match[1].toLowerCase();
      const value = match[2].toLowerCase().replace(/^\./, '');
      if (key === 'type') filters.type = value === 'dir' || value === 'folder' ? 'dir' : 'file';
      else if (key === 'kind') filters.kind = value;
      else if (key === 'ext') filters.ext = value;
      else if (key === 'folder') filters.folder = value.replace(/\/+$/, '').toLowerCase();
    } else {
      words.push(token.toLowerCase());
    }
  }
  return { filters, words };
}

export function searchCatalog(catalog, rawQuery, { limit = 120, kind = '', type = '' } = {}) {
  const query = String(rawQuery || '').trim();
  if (!query || !catalog) return { query, total: 0, results: [] };
  const { filters, words } = parseFilters(query);
  if (kind) filters.kind = String(kind).toLowerCase();
  if (type) filters.type = type === 'dir' ? 'dir' : 'file';
  const phrase = words.join(' ');
  const scored = [];

  for (const entry of catalog.entries) {
    if (filters.type && entry.type !== filters.type) continue;
    if (filters.kind) {
      if (filters.kind === 'folder' ? entry.type !== 'dir' : entry.kind !== filters.kind) continue;
    }
    if (filters.ext && (entry.type !== 'file' || entry.ext !== filters.ext)) continue;
    if (filters.folder) {
      if (entry.type === 'dir') {
        if (entry.path !== filters.folder && !entry.path.startsWith(`${filters.folder}/`)) continue;
      } else if (entry.dir !== filters.folder && !entry.dir.startsWith(`${filters.folder}/`)) {
        continue;
      }
    }

    let score = 0;
    const name = entry.name.toLowerCase();
    if (words.length) {
      if (name === phrase) score += 1200;
      else if (name.startsWith(phrase)) score += 700;
      else if (name.includes(phrase)) score += 400;
      else if (entry.lower.includes(phrase)) score += 180;
      else {
        let all = true;
        for (const word of words) {
          if (name === word) score += 220;
          else if (name.startsWith(word)) score += 140;
          else if (name.includes(word)) score += 80;
          else if (entry.lower.includes(word)) score += 30;
          else {
            all = false;
            break;
          }
        }
        if (!all) continue;
      }
    } else {
      score = 10;
    }
    if (entry.type === 'file') score += 5;
    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || (b.entry.mtimeMs || 0) - (a.entry.mtimeMs || 0));
  return {
    query,
    total: scored.length,
    results: scored.slice(0, limit).map(({ entry, score }) => ({ ...publicEntry(entry), score })),
  };
}

export function archiveHighlights(catalog, archive) {
  if (!catalog) {
    return { coverPath: null, gallery: [], recent: [], folders: [] };
  }
  const files = catalog.entries.filter((entry) => entry.type === 'file');
  const images = files
    .filter((entry) => entry.kind === 'image')
    .sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  const recent = files
    .filter((entry) => entry.kind !== 'image')
    .sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0))
    .slice(0, 8)
    .map(publicEntry);
  const folders = sortEntries(
    catalog.entries.filter((entry) => entry.type === 'dir' && entry.dir === '').map(publicEntry),
  ).sort((a, b) => (b.size || 0) - (a.size || 0));

  return {
    coverPath: catalog.coverPath || pickCover(catalog.entries),
    gallery: images.slice(0, 8).map(publicEntry),
    recent,
    folders: folders.slice(0, 8),
  };
}
