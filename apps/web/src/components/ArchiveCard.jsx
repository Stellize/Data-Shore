import { Link } from 'react-router-dom';
import { ArrowUpRight, EyeOff, Sparkles } from 'lucide-react';
import ArchiveCover from './ArchiveCover.jsx';
import { formatCount, formatRelative, kindSummary } from '../utils.js';

export default function ArchiveCard({ archive, priority = false }) {
  const summary = kindSummary(archive.stats?.kinds) || 'A read-only archive';
  return (
    <Link to={`/archives/${archive.slug}`} className="archive-card">
      <div className="archive-cover">
        <ArchiveCover
          archive={archive}
          path={archive.coverPath}
          alt={`${archive.title} cover`}
          className="archive-cover-img"
          priority={priority}
        />
        <div className="archive-cover-shade" />
        <div className="archive-cover-badges">
          {archive.featured ? (
            <span className="badge badge-accent">
              <Sparkles size={11} /> Featured
            </span>
          ) : null}
          <span className="badge badge-ink">Read-only</span>
          {archive.visibility === 'unlisted' ? (
            <span className="badge badge-ink">
              <EyeOff size={11} /> Unlisted
            </span>
          ) : null}
        </div>
        <span className="archive-cover-count">{formatCount(archive.stats?.files)} files</span>
      </div>
      <div className="archive-card-body">
        <h3 className="archive-card-title">{archive.title}</h3>
        <p className="archive-card-desc">
          {archive.description || 'An archive published from a private drive, open for reading only.'}
        </p>
        <div className="archive-card-tags">
          {archive.tags?.slice(0, 3).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <div className="archive-card-meta">
          <span>
            {summary} · {formatRelative(archive.syncedAt)}
          </span>
          <span className="archive-open">
            Open <ArrowUpRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  );
}
