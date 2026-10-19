import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  LockKeyhole,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import ArchiveCover from '../components/ArchiveCover.jsx';
import Modal from '../components/Modal.jsx';
import CoverPicker from './CoverPicker.jsx';
import { ErrorPanel, Spinner } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import SyncState, { StatusPill } from './SyncState.jsx';
import { useConsole } from './ConsoleContext.jsx';
import { api } from '../api.js';
import { useDocumentTitle, useFetch } from '../hooks.js';
import { formatBytes, formatCount, formatDate, formatRelative, kindSummary } from '../utils.js';

const EMPTY_FORM = {
  title: '',
  description: '',
  curator: '',
  tags: '',
  visibility: 'public',
  downloads: true,
  featured: false,
};

export default function ArchiveManage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { onExpired, demoMode } = useConsole();
  const { push } = useToast();
  const [polling, setPolling] = useState(false);
  const { data, error, loading, reload } = useFetch(`/api/console/archives/${id}`, {
    pollMs: polling ? 2200 : 0,
  });
  const archive = data?.archive;
  const initialized = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState(null);
  const covers = useFetch(archive?.hasCatalog ? `/api/console/archives/${id}/covers` : null);

  useDocumentTitle(archive?.title ? `${archive.title} · Console` : 'Manage archive');

  useEffect(() => {
    if (!archive || initialized.current === archive.id) return;
    initialized.current = archive.id;
    setForm({
      title: archive.title || '',
      description: archive.description || '',
      curator: archive.curator || '',
      tags: (archive.tags || []).join(', '),
      visibility: archive.visibility || 'public',
      downloads: archive.downloads !== false,
      featured: Boolean(archive.featured),
    });
  }, [archive]);

  useEffect(() => {
    if (!archive) return;
    setPolling(Boolean(archive.sync) || archive.status === 'syncing');
  }, [archive]);

  useEffect(() => {
    if (error?.status === 401) onExpired();
  }, [error, onExpired]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api(`/api/console/archives/${id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          description: form.description,
          curator: form.curator,
          tags: form.tags,
          visibility: form.visibility,
          downloads: form.downloads,
          featured: form.featured,
        },
      });
      push('Archive details saved.', { tone: 'success' });
      reload();
    } catch (err) {
      if (err.status === 401) onExpired();
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setPolling(true);
    try {
      await api(`/api/console/archives/${id}/sync`, { method: 'POST' });
      push('Sync queued. The node is being read now.', { tone: 'success' });
      reload();
    } catch (err) {
      if (err.status === 401) onExpired();
      push(err.message, { tone: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/api/console/archives/${id}`, { method: 'DELETE' });
      push('Archive removed from the hub. Files were not touched.', { tone: 'success' });
      navigate('/console');
    } catch (err) {
      if (err.status === 401) onExpired();
      push(err.message, { tone: 'error' });
      setDeleting(false);
    }
  };

  const chooseCover = async (path) => {
    try {
      await api(`/api/console/archives/${id}`, { method: 'PATCH', body: { coverPath: path } });
      push(path ? 'Cover updated.' : 'Cover set back to automatic.', { tone: 'success' });
      reload();
      covers.reload();
    } catch (err) {
      if (err.status === 401) onExpired();
      push(err.message, { tone: 'error' });
    }
  };

  const copy = async (value, message) => {
    try {
      await navigator.clipboard.writeText(value);
      push(message, { tone: 'success' });
    } catch {
      push('Could not copy to the clipboard.', { tone: 'error' });
    }
  };

  if (loading && !data) {
    return (
      <div className="console-view">
        <div className="console-head">
          <div>
            <span className="eyebrow">Archive</span>
            <h1>Opening…</h1>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="console-view">
        <Link to="/console" className="back-link">
          <ArrowLeft size={14} /> Console
        </Link>
        <ErrorPanel error={error} onRetry={reload} title="That archive could not be opened." />
      </div>
    );
  }

  if (!archive) return null;

  const isSyncing = Boolean(archive.sync) || archive.status === 'syncing';
  const viewUrl = `${window.location.origin}/archives/${archive.slug}`;

  return (
    <div className="console-view">
      <Link to="/console" className="back-link">
        <ArrowLeft size={14} /> Console
      </Link>

      <header className="console-head manage-head">
        <div>
          <span className="eyebrow">Archive · {archive.slug}</span>
          <h1>{archive.title}</h1>
          <p>
            {formatCount(archive.stats?.files)} files · {formatBytes(archive.stats?.bytes)} ·{' '}
            {archive.syncedAt ? `last synced ${formatRelative(archive.syncedAt)}` : 'never synced'}
          </p>
        </div>
        <div className="console-head-actions">
          <StatusPill archive={archive} />
          {archive.syncedAt ? (
            <Link to={`/archives/${archive.slug}`} target="_blank" className="btn btn-secondary btn-sm">
              View shore <ArrowUpRight size={14} />
            </Link>
          ) : null}
        </div>
      </header>

      <div className="console-columns manage-columns">
        <div className="console-primary">
          <section className="panel manage-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Public identity</span>
                <h2>How the archive reads</h2>
                <p>These labels appear on the shore. File contents are never edited.</p>
              </div>
            </div>

            <form onSubmit={save} className="archive-form">
              <div className="field-row">
                <label className="field grow">
                  <span>Title</span>
                  <input
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="field">
                  <span>Curator <small>optional</small></span>
                  <input
                    value={form.curator}
                    onChange={(event) => setForm({ ...form, curator: event.target.value })}
                    placeholder="Your name or studio"
                    maxLength={80}
                  />
                </label>
              </div>

              <label className="field">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  maxLength={600}
                  placeholder="What is inside, and why is it worth keeping?"
                />
                <small className="field-note">{form.description.length}/600 characters</small>
              </label>

              <label className="field">
                <span>Tags <small>comma separated</small></span>
                <input
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                  placeholder="photography, coast, 2024"
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
                    Unlisted archives are reachable by link but hidden from the archive list and
                    search.
                  </small>
                </div>

                <div className="toggle-stack">
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
                      <small>Previews keep working when this is off.</small>
                    </span>
                  </label>
                  <label className="toggle-field">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(event) => setForm({ ...form, featured: event.target.checked })}
                    />
                    <span className="toggle-track" aria-hidden="true">
                      <span />
                    </span>
                    <span>
                      Feature on the home page
                      <small>Featured archives lead the collection.</small>
                    </span>
                  </label>
                </div>
              </div>

              {formError ? <p className="form-error">{formError}</p> : null}

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Spinner size={15} /> : <Check size={16} />}
                  {saving ? 'Saving…' : 'Save details'}
                </button>
                <span className="form-note">Slug stays fixed at /archives/{archive.slug}.</span>
              </div>
            </form>
          </section>

          <CoverPicker
            archive={archive}
            covers={covers.data?.covers || []}
            autoCoverPath={covers.data?.autoCoverPath || archive.autoCoverPath}
            loading={covers.loading}
            onSelect={chooseCover}
          />

          <section className="panel manage-panel node-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Source</span>
                <h2>Node & share</h2>
                <p>The hub keeps this address and token privately.</p>
              </div>
              <Server size={17} className="panel-head-icon" />
            </div>
            <div className="detail-list">
              <div>
                <span>Node name</span>
                <strong>{archive.node?.nodeName || 'Data Shore node'}</strong>
              </div>
              <div>
                <span>Node URL</span>
                <strong className="mono">{archive.node?.url}</strong>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => copy(archive.node?.url || '', 'Node URL copied.')}
                  aria-label="Copy node URL"
                >
                  <Copy size={13} />
                </button>
              </div>
              <div>
                <span>Share ID</span>
                <strong className="mono">{archive.node?.shareId}</strong>
              </div>
              <div>
                <span>Credentials</span>
                <strong>
                  {archive.hasCredentials ? (
                    <>
                      <KeyRound size={12} /> token held server-side
                    </>
                  ) : (
                    'missing'
                  )}
                </strong>
              </div>
            </div>
            <p className="callout">
              <ShieldCheck size={14} /> Visitors never see this URL or token. Media is proxied
              through the hub after checking the public catalog.
            </p>
          </section>

          <section className="panel manage-panel danger-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Danger zone</span>
                <h2>Remove this archive</h2>
                <p>Only the public copy and catalog are deleted. Your files stay untouched.</p>
              </div>
              <TriangleAlert size={17} className="panel-head-icon" />
            </div>
            <div className="danger-row">
              <div>
                <strong>Delete “{archive.title}” from this hub</strong>
                <p>The node keeps serving its folder; re-pairing recreates the archive.</p>
              </div>
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> Delete archive
              </button>
            </div>
          </section>
        </div>

        <aside className="console-aside">
          <section className="panel sync-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Catalog</span>
                <h2>Sync state</h2>
              </div>
              <RefreshCw size={16} className="panel-head-icon" />
            </div>
            <SyncState archive={archive} />
            {archive.status === 'error' && archive.syncedAt ? (
              <p className="callout callout-warn">
                The last catalog is still being served. Fix the node, then sync again.
              </p>
            ) : null}
            <div className="mini-stats">
              <div>
                <span>Files</span>
                <strong>{formatCount(archive.stats?.files)}</strong>
              </div>
              <div>
                <span>Folders</span>
                <strong>{formatCount(archive.stats?.folders)}</strong>
              </div>
              <div>
                <span>Bytes</span>
                <strong>{formatBytes(archive.stats?.bytes)}</strong>
              </div>
            </div>
            <p className="mini-kinds">{kindSummary(archive.stats?.kinds) || 'No catalog yet'}</p>
            <div className="sync-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={sync}
                disabled={isSyncing || syncing}
              >
                {syncing ? <Spinner size={14} /> : <RefreshCw size={14} />}
                {isSyncing ? 'Syncing…' : 'Sync now'}
              </button>
              {archive.syncedAt ? (
                <span className="sync-time">Last sync {formatDate(archive.syncedAt)}</span>
              ) : null}
            </div>
          </section>

          <section className="panel share-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Share</span>
                <h2>Public doorway</h2>
              </div>
              <Link2 size={16} className="panel-head-icon" />
            </div>
            <p className="share-url">{viewUrl}</p>
            <div className="share-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => copy(viewUrl, 'Public link copied.')}
              >
                <Copy size={13} /> Copy link
              </button>
              {archive.syncedAt ? (
                <Link to={`/archives/${archive.slug}`} target="_blank" className="btn btn-ghost btn-sm">
                  Open <ExternalLink size={13} />
                </Link>
              ) : null}
            </div>
            <div className="share-metrics">
              <div>
                <span>Visits</span>
                <strong>{formatCount(archive.views || 0)}</strong>
              </div>
              <div>
                <span>Downloads</span>
                <strong>{formatCount(archive.downloadCount || 0)}</strong>
              </div>
            </div>
            <p className="callout">
              <LockKeyhole size={14} /> Read-only for visitors. {archive.downloads ? 'Downloads are enabled.' : 'Downloads are disabled.'}
            </p>
          </section>

          {demoMode ? (
            <section className="panel console-aside-note">
              <p>
                Demo archive. Removing it only clears the sample hub; the demo script reseeds on a
                fresh start.
              </p>
            </section>
          ) : null}
        </aside>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        className="confirm-modal"
        label="Delete archive"
      >
        <div className="confirm-icon">
          <Trash2 size={22} />
        </div>
        <h2>Delete “{archive.title}”?</h2>
        <p>
          This removes the catalog, public page, and stored node token from this hub. The source
          folder on the node is not touched.
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={deleting}>
            {deleting ? <Spinner size={14} /> : <Trash2 size={14} />}
            {deleting ? 'Deleting…' : 'Delete archive'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
