import { AlertTriangle, Compass, Loader2, RefreshCw } from 'lucide-react';

export function Spinner({ size = 16, label = 'Loading' }) {
  return <Loader2 size={size} className="spinner-icon" aria-label={label} />;
}

export function LoadingBlock({ label = 'Reading the shore…', compact = false }) {
  return (
    <div className={compact ? 'loading-block compact' : 'loading-block'} role="status">
      <Spinner size={18} />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonGrid({ count = 6, variant = 'card' }) {
  return (
    <div className={variant === 'card' ? 'skeleton-grid' : 'file-grid'}>
      {Array.from({ length: count }).map((_, index) => (
        <div className={variant === 'card' ? 'skeleton-card' : 'skeleton-tile'} key={index}>
          <div className="skeleton skeleton-cover" />
          <div className="skeleton skeleton-line w-70" />
          <div className="skeleton skeleton-line w-40" />
        </div>
      ))}
    </div>
  );
}

export function ErrorPanel({ error, onRetry, title = 'The tide went out.' }) {
  const message =
    error?.message || 'Something interrupted that request. The hub might be offline.';
  return (
    <div className="state-panel state-error" role="alert">
      <span className="state-icon">
        <AlertTriangle size={22} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{message}</p>
        {onRetry ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
            <RefreshCw size={14} /> Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action, icon = <Compass size={22} /> }) {
  return (
    <div className="state-panel state-empty">
      <span className="state-icon">{icon}</span>
      <div>
        <h3>{title}</h3>
        {children ? <p>{children}</p> : null}
        {action}
      </div>
    </div>
  );
}
