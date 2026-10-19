/**
 * Tiny in-memory search over the share catalog. Dependency-free and fast
 * enough for a few hundred thousand entries.
 */

function parseQuery(raw) {
  const filters = {};
  const words = [];
  for (const token of String(raw || '').trim().split(/\s+/).filter(Boolean)) {
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

export function searchIndex(index, rawQuery, { limit = 120 } = {}) {
  const query = String(rawQuery || '').trim();
  if (!query) return { query, total: 0, results: [] };
  const { filters, words } = parseQuery(query);
  const phrase = words.join(' ');
  const scored = [];

  for (const entry of index.entries) {
    if (filters.type && entry.type !== filters.type) continue;
    if (filters.kind) {
      if (filters.kind === 'folder' ? entry.type !== 'dir' : entry.kind !== filters.kind) continue;
    }
    if (filters.ext) {
      if (entry.type !== 'file' || entry.ext !== filters.ext) continue;
    }
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

  scored.sort((a, b) => b.score - a.score || b.entry.mtimeMs - a.entry.mtimeMs);

  return {
    query,
    total: scored.length,
    results: scored.slice(0, limit).map(({ entry }) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      kind: entry.kind,
      ext: entry.ext,
      size: entry.size,
      fileCount: entry.fileCount ?? null,
      mtime: entry.mtime,
    })),
  };
}
