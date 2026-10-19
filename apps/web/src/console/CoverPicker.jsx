import { useState } from 'react';
import { Check, Image as ImageIcon, Loader2, RotateCcw } from 'lucide-react';
import { streamUrl } from '../api.js';

/**
 * Pick the public cover for an archive. "Automatic" uses the largest recent
 * image chosen by the hub at sync time.
 */
export default function CoverPicker({ archive, covers, autoCoverPath, loading, onSelect }) {
  const [selected, setSelected] = useState(archive.coverPath || '');
  const [busy, setBusy] = useState('');

  const choose = async (path) => {
    setBusy(path || 'auto');
    setSelected(path || '');
    try {
      await onSelect(path || null);
    } finally {
      setBusy('');
    }
  };

  const current = selected || archive.coverPath || autoCoverPath;

  return (
    <section className="panel manage-panel cover-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Cover</span>
          <h2>The first thing visitors see</h2>
          <p>Pick an image from the archive, or let the hub choose the largest recent plate.</p>
        </div>
        <ImageIcon size={17} className="panel-head-icon" />
      </div>

      <div className="cover-picker">
        <div className="cover-current">
          <div className="cover-current-frame">
            {current ? (
              <img src={streamUrl(archive.slug, current)} alt="Current cover" />
            ) : (
              <span>No image in this archive yet</span>
            )}
          </div>
          <div className="cover-current-meta">
            <span className="mono-label">{archive.coverPath ? 'Chosen cover' : 'Automatic cover'}</span>
            <p>{current || 'A generated contour illustration will stand in.'}</p>
            <div className="cover-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => choose(null)}
                disabled={Boolean(busy) || !archive.coverPath}
              >
                {busy === 'auto' ? <Loader2 size={13} className="spinner-icon" /> : <RotateCcw size={13} />}
                Use automatic
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="cover-loading">
            <Loader2 size={14} className="spinner-icon" /> Reading images from the catalog…
          </p>
        ) : covers.length === 0 ? (
          <p className="cover-empty">This archive has no images. The contour illustration will be used.</p>
        ) : (
          <div className="cover-grid" role="radiogroup" aria-label="Choose a cover image">
            {covers.map((cover) => {
              const active = current === cover.path;
              return (
                <button
                  type="button"
                  key={cover.path}
                  role="radio"
                  aria-checked={active}
                  aria-label={`Use ${cover.name} as cover`}
                  className={`cover-option${active ? ' is-active' : ''}`}
                  onClick={() => choose(cover.path)}
                  title={cover.path}
                >
                  <img src={streamUrl(archive.slug, cover.path)} alt="" loading="lazy" />
                  {active ? (
                    <span className="cover-check">
                      {busy === cover.path ? (
                        <Loader2 size={12} className="spinner-icon" />
                      ) : (
                        <Check size={12} />
                      )}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
