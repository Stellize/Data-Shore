import { ArrowUpRight, CornerDownRight } from 'lucide-react';
import KindIcon, { kindLabel } from './KindIcon.jsx';
import Highlight from './Highlight.jsx';
import { formatBytes, formatRelative } from '../utils.js';

export default function ResultRow({ entry, archive, query, onOpen, showArchive = false }) {
  return (
    <button type="button" className="result-row" onClick={() => onOpen(entry)}>
      <span className="result-icon">
        <KindIcon kind={entry.kind} size={17} />
      </span>
      <span className="result-main">
        <span className="result-name">
          <Highlight text={entry.name} query={query} />
        </span>
        <span className="result-path">
          {showArchive && archive ? <span className="result-archive">{archive.title}</span> : null}
          {entry.type === 'dir' ? (
            <>
              <CornerDownRight size={11} /> folder
            </>
          ) : (
            <>
              {entry.dir ? <span className="result-dir">{entry.dir}</span> : null}
              <span>{kindLabel(entry.kind, entry.ext)}</span>
            </>
          )}
        </span>
      </span>
      <span className="result-meta">
        {entry.type === 'file' ? formatBytes(entry.size) : `${entry.fileCount || 0} files`}
        <span>{entry.mtime ? formatRelative(entry.mtime) : ''}</span>
      </span>
      <ArrowUpRight size={14} className="result-arrow" />
    </button>
  );
}
