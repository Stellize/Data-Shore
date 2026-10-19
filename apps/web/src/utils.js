export {
  clamp,
  formatBytes,
  formatCount,
  formatDate,
  formatRelative,
  humanizeDuration,
  kindOf,
  pathSegments,
  baseName,
  parentPath,
} from '@datashore/shared';

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function hashString(value = '') {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

const PALETTES = [
  ['#0d3b40', '#166b68', '#61d6bd'],
  ['#2b2a24', '#5c513a', '#e9c48d'],
  ['#122c3d', '#245069', '#8fc6d8'],
  ['#31272a', '#5a3d3c', '#e5a184'],
  ['#1b3130', '#37584a', '#bcd6a7'],
  ['#26283d', '#42446a', '#b9b7e8'],
];

export function paletteFor(seed = '') {
  return PALETTES[hashString(seed) % PALETTES.length];
}

export function kindSummary(kinds = {}) {
  const labels = {
    image: 'images',
    video: 'videos',
    audio: 'audio',
    pdf: 'PDFs',
    text: 'texts',
    code: 'code files',
    archive: 'archives',
    document: 'documents',
    other: 'other files',
  };
  return Object.entries(kinds)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kind, count]) => `${count.toLocaleString('en-US')} ${labels[kind] || kind}`)
    .join(' · ');
}

export const FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'pdf', label: 'PDFs' },
  { id: 'text', label: 'Text' },
  { id: 'document', label: 'Documents' },
];

export function matchesFilter(entry, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'pdf' || filter === 'document') {
    return entry.kind === 'pdf' || entry.kind === 'document';
  }
  if (filter === 'text') return entry.kind === 'text' || entry.kind === 'code';
  return entry.kind === filter;
}

export function fileFolder(path = '') {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function withSearchParam(pathname, params, updates) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString('en-US')} ${Number(count) === 1 ? singular : plural}`;
}
