/**
 * @datashore/shared — the small vocabulary both the archive node and the
 * public hub speak. No Node or browser APIs live here.
 */

export const PROTOCOL_VERSION = 1;

export const KIND_META = {
  image: { label: 'Image', plural: 'Images' },
  video: { label: 'Video', plural: 'Videos' },
  audio: { label: 'Audio', plural: 'Audio' },
  pdf: { label: 'PDF', plural: 'PDFs' },
  text: { label: 'Text', plural: 'Text' },
  code: { label: 'Code', plural: 'Code' },
  archive: { label: 'Archive', plural: 'Archives' },
  document: { label: 'Document', plural: 'Documents' },
  other: { label: 'File', plural: 'Files' },
};

const KIND_BY_EXT = {
  image: 'jpg jpeg png gif webp avif bmp tif tiff heic heif svg ico jfif',
  video: 'mp4 m4v webm mov ogv mkv avi',
  audio: 'mp3 wav flac ogg oga m4a aac opus wma',
  pdf: 'pdf',
  text: 'txt md markdown mdx csv tsv log rtf json jsonl yaml yml toml ini cfg conf env xml html htm xhtml srt vtt',
  code: 'js mjs cjs jsx ts tsx css scss sass less py rb go rs java kt c h cpp cc hpp cs php sh bash zsh fish sql graphql gql swift lua pl r dart vue svelte astro dockerfile makefile',
  archive: 'zip tar gz tgz bz2 xz 7z rar iso dmg',
  document: 'doc docx xls xlsx ppt pptx odt ods odp epub mobi pages numbers key',
};

/** extension -> kind */
export const EXT_KIND = Object.fromEntries(
  Object.entries(KIND_BY_EXT).flatMap(([kind, exts]) =>
    exts.split(' ').map((ext) => [ext, kind]),
  ),
);

/** Types that browsers can safely render inline (as media or text). */
export const INLINE_KINDS = new Set(['image', 'video', 'audio', 'pdf', 'text', 'code']);

/** Types that can execute script if served as their native mime type. */
export const ACTIVE_EXTENSIONS = new Set([
  'html', 'htm', 'xhtml', 'svg', 'xml', 'xsl', 'xslt', 'mhtml', 'mht',
]);

export const HIDDEN_NAMES = new Set([
  'thumbs.db', 'desktop.ini', '.ds_store', 'ehthumbs.db', '$recycle.bin',
  'system volume information', '.trash', '.trashes', 'lost+found',
]);

export function extOf(name = '') {
  const base = String(name).split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function kindOf(name = '') {
  const ext = extOf(name);
  if (ext && EXT_KIND[ext]) return EXT_KIND[ext];
  const base = String(name).split(/[\\/]/).pop() || '';
  if (/^(dockerfile|makefile|readme|license|licence|changelog|authors|contributing)$/i.test(base)) {
    return base.toLowerCase() === 'readme' ? 'text' : 'text';
  }
  return 'other';
}

export function isHiddenName(name = '') {
  const base = String(name).toLowerCase();
  return base.startsWith('.') || HIDDEN_NAMES.has(base) || base.startsWith('~$');
}

export function isActiveExtension(ext = '') {
  return ACTIVE_EXTENSIONS.has(String(ext).toLowerCase());
}

export function isPreviewableKind(kind) {
  return INLINE_KINDS.has(kind);
}

export function formatBytes(bytes, opts = {}) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '—';
  const n = Number(bytes);
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / 1024 ** i;
  const digits = opts.digits ?? (i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2);
  return `${value.toFixed(digits).replace(/\.0+$/, '')} ${units[i]}`;
}

export function formatCount(n) {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
  }).format(date);
}

export function formatRelative(value, now = Date.now()) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return formatDate(then);
}

export function slugify(input = '') {
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'archive';
}

export function titleizeSlug(slug = '') {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Normalize a browser-supplied archive path to `a/b/c` form.
 * Returns null when the path tries to escape (after URL decoding).
 */
export function normalizeArchivePath(input = '') {
  let raw = String(input ?? '');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  raw = raw.replace(/\\/g, '/').replace(/\0/g, '');
  if (raw.length > 2048) return null;
  const segments = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

export function pathSegments(path = '') {
  return String(path).split('/').filter(Boolean);
}

export function parentPath(path = '') {
  const parts = pathSegments(path);
  parts.pop();
  return parts.join('/');
}

export function baseName(path = '') {
  const parts = pathSegments(path);
  return parts[parts.length - 1] || '';
}

export function humanizeDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
