import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { phaseLabel, statusOf, syncPercent } from './status.js';

export function StatusPill({ archive }) {
  const status = statusOf(archive);
  return (
    <span className={`status-pill status-${status.tone}`}>
      <span className={`status-dot${status.pulse ? ' is-pulsing' : ''}`} />
      {status.label}
    </span>
  );
}

export default function SyncState({ archive, compact = false }) {
  const status = statusOf(archive);
  const sync = archive.sync;
  const percent = syncPercent(sync);

  if (sync) {
    return (
      <div className={compact ? 'sync-state compact' : 'sync-state'}>
        <div className="sync-state-head">
          <span className="status-pill status-syncing">
            <Loader2 size={12} className="spinner-icon" /> {phaseLabel(sync)}
          </span>
          {percent !== null ? <span className="sync-percent">{percent}%</span> : null}
        </div>
        <div className={`progress${percent === null ? ' is-indeterminate' : ''}`}>
          <span style={percent !== null ? { width: `${percent}%` } : undefined} />
        </div>
        <p className="sync-message">
          {sync.message || 'Reading the archive…'}
          {sync.total ? ` · ${sync.fetched ?? 0} of ${sync.total} entries` : ''}
        </p>
      </div>
    );
  }

  if (archive.status === 'error') {
    return (
      <div className="sync-state sync-error">
        <span className="status-pill status-error">
          <AlertTriangle size={12} /> Sync failed
        </span>
        <p className="sync-message">{archive.syncError || 'The node could not be read.'}</p>
      </div>
    );
  }

  if (archive.status === 'live') {
    return (
      <div className="sync-state sync-live">
        <span className="status-pill status-live">
          <CheckCircle2 size={12} /> Live
        </span>
        <p className="sync-message">Catalog is up to date.</p>
      </div>
    );
  }

  return (
    <div className="sync-state">
      <span className={`status-pill status-${status.tone}`}>{status.label}</span>
    </div>
  );
}
