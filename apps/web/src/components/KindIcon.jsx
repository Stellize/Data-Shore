import {
  File,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileType2,
  Film,
  Folder,
  Image,
  Music,
} from 'lucide-react';

const ICONS = {
  folder: Folder,
  image: Image,
  video: Film,
  audio: Music,
  pdf: FileText,
  text: FileText,
  code: FileCode2,
  archive: FileArchive,
  document: FileType2,
  other: File,
};

export function kindLabel(kind, ext = '') {
  if (kind === 'folder') return 'Folder';
  if (kind === 'pdf') return 'PDF';
  if (ext) return ext.toUpperCase();
  return String(kind || 'file').replace(/^\w/, (c) => c.toUpperCase());
}

export default function KindIcon({ kind = 'other', size = 18, className = '' }) {
  const Icon = ICONS[kind] || File;
  return <Icon size={size} className={`kind-icon-svg kind-${kind} ${className}`.trim()} aria-hidden="true" />;
}
