import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Link2,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  Server,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { useToast } from '../components/Toast.jsx';
import { Spinner } from '../components/States.jsx';
import { useConsole } from './ConsoleContext.jsx';
import { api } from '../api.js';
import { formatBytes, formatCount } from '../utils.js';

const EMPTY_FORM = {
  title: '',
  description: '',
  tags: '',
  visibility: 'public',
  downloads: true,
};

export default function PairingPanel({ onCreated, defaultOpen = false }) {
  const { onExpired, demoMode } = useConsole();
  const { push } = useToast();
  const [mode, setMode] = useState('code');
  const [code, setCode] = useState('');
  const [url, setUrl] = useState('http://127.0.0.1:4770');
  const [token, setToken] = useState('');
  const [node, setNode] = useState(null);
  const [selectedShare, setSelectedShare] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  const share = useMemo(
    () => node?.shares?.find((item) => item.id === selectedShare) || null,
    [node, selectedShare],
  );

  useEffect(() => {
    if (!node?.shares?.length) return;
    const first = node.shares[0];
    setSelectedShare(first.id);
    setForm({
      ...EMPTY_FORM,
      title: first.name,
      description: first.description || '',
      tags: '',
    });
  }, [node]);

  const credentials = () => (mode === 'code' ? { code } : { url, token });

  const inspect = async (event) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    setNode(null);
    setSelectedShare('');
    try {
      const result = await api('/api/console/inspect', {
        method: 'POST',
        body: credentials(),
      });
      setNode(result.node);
      if (!result.node.shares?.length) {
        setError('That node has no shares configured. Add a folder in its config and restart it.');
      } else {
        setOpen(true);
        push(`Connected to “${result.node.name}”.`, { tone: 'success' });
      }
    } catch (err) {
      if (err.status === 401) onExpired();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chooseShare = (next) => {
    setSelectedShare(next.id);
    setForm({
      ...EMPTY_FORM,
      title: next.name,
      description: next.description || '',
    });
  };

  const publish = async (event) => {
    event.preventDefault();
    if (!share || !form.title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api('/api/console/archives', {
        method: 'POST',
        body: {
          ...credentials(),
          shareId: share.id,
          title: form.title.trim(),
          description: form.description.trim(),
          tags: form.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          visibility: form.visibility,
          downloads: form.downloads,
        },
      });
      setCode('');
      setToken('');
      setNode(null);
      setSelectedShare('');
      setForm(EMPTY_FORM);
      push('Archive created. The first catalog is on its way.', { tone: 'success' });
      onCreated?.(result.archive);
    } catch (err) {
      if (err.status === 401) onExpired();
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="panel pairing" id="pairing">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Add an archive</span>
          <h2>Pair a node</h2>
          <p>Paste the pairing code printed by the node. Nothing is uploaded but the catalog.</p>
        </div>
        <button
          type="button"
          className="text-btn pairing-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Collapse' : node ? 'Review pairing' : 'Pair a node'}
          <ArrowRight size={14} className={open ? 'is-open' : ''} />
        </button>
      </div>

      {open ? (
        <div className="pairing-body">
          {!node ? (
            <form onSubmit={inspect} className="pairing-step">
              <div className="step-marker">
                <span>01</span>
                <div>
                  <h3>Connect to the node</h3>
                  <p>
                    Run the node on the machine holding your files, then paste the code it prints.
                  </p>
                </div>
              </div>

              <div className="segmented" role="tablist" aria-label="Pairing method">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'code'}
                  className={mode === 'code' ? 'is-active' : ''}
                  onClick={() => setMode('code')}
                >
                  Pairing code
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'manual'}
                  className={mode === 'manual' ? 'is-active' : ''}
                  onClick={() => setMode('manual')}
                >
                  URL & token
                </button>
              </div>

              {mode === 'code' ? (
                <label className="field">
                  <span>Pairing code</span>
                  <textarea
                    rows={3}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="eyJ2IjoxLCJraW5kIjoiZGF0YS1zaG9yZS1ub2RlIi…"
                    spellCheck="false"
                    required
                  />
                </label>
              ) : (
                <div className="field-row">
                  <label className="field">
                    <span>Node URL</span>
                    <input
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="http://127.0.0.1:4770"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Node token</span>
                    <input
                      type="password"
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      placeholder="dsn_…"
                      autoComplete="off"
                      required
                    />
                  </label>
                </div>
              )}

              {error ? <p className="form-error">{error}</p> : null}

              <div className="pairing-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? <Spinner size={15} /> : <PlugZap size={16} />}
                  {busy ? 'Reaching the node…' : 'Check node'}
                </button>
                <span className="pairing-security">
                  <LockKeyhole size={13} /> The token is stored on the hub only.
                </span>
              </div>

              <p className="pairing-hint">
                No node running? On the machine holding the files:{' '}
                <code>npm run node -- --root &quot;/path/to/folder&quot; --name &quot;Home archive&quot;</code>
              </p>
            </form>
          ) : (
            <div className="pairing-step">
              <div className="node-connected">
                <span className="node-connected-icon">
                  <Server size={18} />
                </span>
                <div className="node-connected-main">
                  <span className="mono-label">Node connected</span>
                  <h3>{node.name}</h3>
                  <span className="node-url">{node.url}</span>
                </div>
                <div className="node-badges">
                  <span className="badge badge-accent">
                    <ShieldCheck size={11} /> Read-only
                  </span>
                  <span className="badge badge-quiet">v{node.version || '0.1'}</span>
                </div>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    setNode(null);
                    setError(null);
                  }}
                >
                  <Unplug size={14} /> Change node
                </button>
              </div>

              <div className="step-marker">
                <span>02</span>
                <div>
                  <h3>Choose a share</h3>
                  <p>Each share is a folder configured on the node. Publish one at a time.</p>
                </div>
              </div>

              <div className="share-list" role="radiogroup" aria-label="Node shares">
                {node.shares.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    role="radio"
                    aria-checked={selectedShare === item.id}
                    className={`share-option${selectedShare === item.id ? ' is-selected' : ''}`}
                    onClick={() => chooseShare(item)}
                  >
                    <span className="share-radio">{selectedShare === item.id ? <Check size={12} /> : null}</span>
                    <span className="share-main">
                      <span className="share-name">{item.name}</span>
                      <span className="share-id">{item.id}</span>
                      <span className="share-desc">
                        {item.description || 'No description on the node.'}
                      </span>
                    </span>
                    <span className="share-stats">
                      {item.stats ? (
                        <>
                          <strong>{formatCount(item.stats.files)}</strong> files
                          <span>{formatBytes(item.stats.bytes)}</span>
                        </>
                      ) : (
                        <span className="share-cold">
                          <RefreshCw size={11} /> will index
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>

              {share ? (
                <form onSubmit={publish} className="archive-form">
                  <div className="step-marker">
                    <span>03</span>
                    <div>
                      <h3>Describe the archive</h3>
                      <p>This is the public label on the shore. You can edit it later.</p>
                    </div>
                  </div>

                  <div className="field-row">
                    <label className="field">
                      <span>Title</span>
                      <input
                        value={form.title}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                        maxLength={120}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Tags <small>comma separated</small></span>
                      <input
                        value={form.tags}
                        onChange={(event) => setForm({ ...form, tags: event.target.value })}
                        placeholder="photography, coast, 2024"
                        maxLength={160}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      maxLength={600}
                      placeholder="What is inside, and why it is worth keeping?"
                    />
                  </label>

                  <div className="field-row">
                    <div className="field">
                      <span>Visibility</span>
                      <div className="segmented">
                        <button
                          type="button"
                          className={form.visibility === 'public' ? 'is-active' : ''}
                          onClick={() => setForm({ ...form, visibility: 'public' })}
                        >
                          Public
                        </button>
                        <button
                          type="button"
                          className={form.visibility === 'unlisted' ? 'is-active' : ''}
                          onClick={() => setForm({ ...form, visibility: 'unlisted' })}
                        >
                          Unlisted
                        </button>
                      </div>
                      <small className="field-note">
                        Unlisted archives are reachable by link but hidden from search and the
                        archive list.
                      </small>
                    </div>
                    <label className="toggle-field">
                      <input
                        type="checkbox"
                        checked={form.downloads}
                        onChange={(event) => setForm({ ...form, downloads: event.target.checked })}
                      />
                      <span className="toggle-track" aria-hidden="true">
                        <span />
                      </span>
                      <span>
                        Allow downloads
                        <small>Visitors can still preview when this is off.</small>
                      </span>
                    </label>
                  </div>

                  {error ? <p className="form-error">{error}</p> : null}

                  <div className="pairing-actions">
                    <button type="submit" className="btn btn-primary" disabled={creating}>
                      {creating ? <Spinner size={15} /> : <Link2 size={16} />}
                      {creating ? 'Publishing…' : 'Publish archive'}
                    </button>
                    <span className="pairing-security">
                      The node begins indexing as soon as you publish.
                    </span>
                  </div>
                </form>
              ) : null}
            </div>
          )}

          {demoMode ? (
            <p className="pairing-demo-note">
              Demo tip: the sample node is already running at <code>http://127.0.0.1:4771</code>.
              Its code was printed by the demo script, or use the URL &amp; token tab.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
