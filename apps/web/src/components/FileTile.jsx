import { useState } from 'react';
import { ArrowUpRight, Folder } from 'lucide-react';
import KindIcon, { kindLabel } from './KindIcon.jsx';
import { streamUrl } from '../api.js';
import { formatBytes, formatCount, formatRelative } from '../utils.js';

function Thumb({ entry, archive }) {
  const [failed, setFailed] = useState(false);
  if (entry.kind === 'image' && !failed) {
    return (
      <img
        src={streamUrl(archive.slug, entry.path)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  if (entry.kind === 'video') {
    return (
      <div className="thumb-generic thumb-video">
        <span className="play-disc">
          <KindIcon kind="video" size={20} />
        </span>
        <span className="thumb-ext">{entry.ext || 'video'}</span>
      </div>
    );
  }
  if (entry.kind === 'audio') {
    return (
      <div className="thumb-generic thumb-audio">
        <span className="waveform" aria-hidden="true">
          {[8, 18, 12, 26, 16, 30, 11, 22, 14, 24, 9, 19].map((height, index) => (
            <i key={index} style={{ height }} />
          ))}
        </span>
        <span className="thumb-ext">{entry.ext || 'audio'}</span>
      </div>
    );
  }
  return (
    <div className={`thumb-generic thumb-paper thumb-${entry.kind}`}>
      <KindIcon kind={entry.kind} size={26} />
      <span className="thumb-ext">{kindLabel(entry.kind, entry.ext)}</span>
    </div>
  );
}

export function FolderCard({ entry, onOpen }) {
  return (
    <button type="button" className="folder-card" onClick={() => onOpen(entry.path)}>
      <span className="folder-card-icon">
        <Folder size={20} />
      </span>
      <span className="folder-card-text">
        <span className="folder-card-name">{entry.name}</span>
        <span className="folder-card-meta">
          {formatCount(entry.fileCount)} files · {formatBytes(entry.size)}
        </span>
      </span>
      <ArrowUpRight size={15} className="folder-card-arrow" />
    </button>
  );
}

export default function FileTile({ entry, archive, onOpen, view = 'grid' }) {
  if (view === 'list') {
    return (
      <button type="button" className="file-row" onClick={() => onOpen(entry.path)}>
        <span className="file-row-thumb">
          <Thumb entry={entry} archive={archive} />
        </span>
        <span className="file-row-main">
          <span className="file-row-name">{entry.name}</span>
          <span className="file-row-meta">
            {kindLabel(entry.kind, entry.ext)} · {formatRelative(entry.mtime)}
          </span>
        </span>
        <span className="file-row-size">{formatBytes(entry.size)}</span>
        <ArrowUpRight size={14} className="file-row-arrow" />
      </button>
    );
  }

  return (
    <button type="button" className="file-tile" onClick={() => onOpen(entry.path)}>
      <span className="file-tile-thumb">
        <Thumb entry={entry} archive={archive} />
        {entry.kind === 'video' ? <span className="tile-play" aria-hidden="true" /> : null}
      </span>
      <span className="file-tile-meta">
        <span className="file-tile-name" title={entry.name}>
          {entry.name}
        </span>
        <span className="file-tile-sub">
          {kindLabel(entry.kind, entry.ext)} · {formatBytes(entry.size)}
        </span>
      </span>
    </button>
  );
}
