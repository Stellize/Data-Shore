import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { ErrorPanel, Spinner } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConsole } from './ConsoleContext.jsx';
import { api } from '../api.js';
import { useDocumentTitle, useFetch } from '../hooks.js';

const EMPTY = {
  hubName: '',
  tagline: '',
  intro: '',
  announcement: '',
};

export default function ConsoleSettings() {
  useDocumentTitle('Settings · Console');
  const { onExpired, demoMode } = useConsole();
  const { push } = useToast();
  const { data, error, loading, reload } = useFetch('/api/console/overview');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (data?.settings) {
      setForm({
        hubName: data.settings.hubName || '',
        tagline: data.settings.tagline || '',
        intro: data.settings.intro || '',
        announcement: data.settings.announcement || '',
      });
    }
  }, [data]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api('/api/console/settings', { method: 'PATCH', body: form });
      push('Shore settings saved.', { tone: 'success' });
      reload();
    } catch (err) {
      if (err.status === 401) onExpired();
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="console-view">
        <div className="console-head">
          <div>
            <span className="eyebrow">Hub console</span>
            <h1>Settings</h1>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="console-view">
        <ErrorPanel error={error} onRetry={reload} title="Settings could not be loaded." />
      </div>
    );
  }

  return (
    <div className="console-view">
      <header className="console-head">
        <div>
          <span className="eyebrow">Hub console</span>
          <h1>Settings</h1>
          <p>The words and fences around this shore.</p>
        </div>
        <div className="console-head-actions">
          <Link to="/" className="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">
            View the shore <ExternalLink size={14} />
          </Link>
        </div>
      </header>

      <div className="console-columns settings-columns">
        <div className="console-primary">
          <section className="panel manage-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Public identity</span>
                <h2>The shore&apos;s own words</h2>
                <p>These appear across the visitor site.</p>
              </div>
            </div>

            <form onSubmit={save} className="archive-form">
              <div className="field-row">
                <label className="field grow">
                  <span>Hub name</span>
                  <input
                    value={form.hubName}
                    onChange={(event) => setForm({ ...form, hubName: event.target.value })}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="field grow">
                  <span>Tagline</span>
                  <input
                    value={form.tagline}
                    onChange={(event) => setForm({ ...form, tagline: event.target.value })}
                    maxLength={160}
                  />
                </label>
              </div>

              <label className="field">
                <span>Intro on the home page</span>
                <textarea
                  rows={3}
                  value={form.intro}
                  onChange={(event) => setForm({ ...form, intro: event.target.value })}
                  maxLength={1200}
                />
              </label>

              <label className="field">
                <span>Announcement <small>optional, shown above the site</small></span>
                <textarea
                  rows={2}
                  value={form.announcement}
                  onChange={(event) => setForm({ ...form, announcement: event.target.value })}
                  maxLength={300}
                  placeholder="A short note for visitors, e.g. “The tide atlas is back online.”"
                />
              </label>

              {formError ? <p className="form-error">{formError}</p> : null}

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Spinner size={15} /> : <Check size={16} />}
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
                {demoMode ? <span className="form-note">Demo settings are stored locally.</span> : null}
              </div>
            </form>
          </section>

          <section className="panel manage-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Guardrails</span>
                <h2>What cannot be changed</h2>
                <p>Read-only is structural, not a toggle.</p>
              </div>
              <ShieldCheck size={17} className="panel-head-icon" />
            </div>
            <ul className="settings-rails">
              <li>
                <LockKeyhole size={16} />
                <div>
                  <strong>No write endpoints</strong>
                  <p>Nodes reject anything but GET/HEAD before touching the filesystem.</p>
                </div>
              </li>
              <li>
                <KeyRound size={16} />
                <div>
                  <strong>Token confinement</strong>
                  <p>Node tokens are stored on the hub and never sent to a browser.</p>
                </div>
              </li>
              <li>
                <Waves size={16} />
                <div>
                  <strong>Catalog-only storage</strong>
                  <p>Only names, sizes, and dates live here. Bytes stream from the node.</p>
                </div>
              </li>
            </ul>
            <p className="callout">
              <ShieldCheck size={14} /> For the full threat model, read the{' '}
              <Link to="/about">design notes</Link>.
            </p>
          </section>
        </div>

        <aside className="console-aside">
          <section className="panel manage-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Access</span>
                <h2>Console security</h2>
              </div>
              <KeyRound size={16} className="panel-head-icon" />
            </div>
            <div className="security-list">
              <p>
                The console password comes from <code>DATA_SHORE_ADMIN_PASSWORD</code> when the hub
                starts. If it was not set, a generated password was printed once in the terminal.
              </p>
              <p>
                Sessions are signed HTTP-only cookies that last seven days. Signing out clears the
                cookie on this browser.
              </p>
              <p>
                Run the hub behind HTTPS. In production, set a password manager-grade secret and
                keep the data directory private.
              </p>
            </div>
            {demoMode ? (
              <p className="callout callout-warn">
                This demo uses the password <code>shore</code>. Never expose demo mode publicly.
              </p>
            ) : null}
          </section>

          <section className="panel console-aside-note">
            <p>
              Data Shore hub v{data?.version || '0.1.0'} · protocol {data?.protocol || 1}. The hub
              stores its database in its data directory; nothing is sent to a third party.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
