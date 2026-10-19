import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Waves } from 'lucide-react';
import { LogoMark } from '../components/Logo.jsx';
import { Spinner } from '../components/States.jsx';
import { api } from '../api.js';

export default function Login({ demoMode, hubName, onSuccess }) {
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/console/session', { method: 'POST', body: { password } });
      setPassword('');
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <aside className="login-aside">
        <div className="login-aside-top">
          <Link to="/" className="login-brand">
            <LogoMark size={38} />
            <span>
              <strong>{hubName || 'Data Shore'}</strong>
              <small>Hub console</small>
            </span>
          </Link>
          <p className="login-quote">
            “A shore is where the water is allowed to arrive, but not to take anything back.”
          </p>
        </div>
        <ul className="login-points">
          <li>
            <ShieldCheck size={16} />
            Only this console can publish, sync, or remove archives.
          </li>
          <li>
            <LockKeyhole size={16} />
            The visitor site never sees node tokens.
          </li>
          <li>
            <Waves size={16} />
            Your files stay on your machines.
          </li>
        </ul>
        <div className="login-aside-foot">
          <span>Read-only by design</span>
          <span>Data Shore v0.1</span>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-card">
          <Link to="/" className="back-link">
            <ArrowLeft size={14} /> Back to the shore
          </Link>
          <span className="eyebrow">Curator access</span>
          <h1>Sign in to the console.</h1>
          <p className="login-lede">
            Pair nodes, curate descriptions, and pull fresh catalogs. Visitors never need an
            account.
          </p>

          <form onSubmit={submit} className="login-form">
            <label className="field">
              <span>Console password</span>
              <span className="password-input">
                <KeyRound size={15} />
                <input
                  type={reveal ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setReveal((value) => !value)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" className="btn btn-primary login-submit" disabled={busy || !password}>
              {busy ? <Spinner size={15} /> : null}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {demoMode ? (
            <div className="login-demo">
              <span className="badge badge-accent">Demo</span>
              <p>
                This demo shore uses the password <code>shore</code>. Do not reuse it for a real
                hub.
              </p>
            </div>
          ) : (
            <p className="login-hint">
              Set <code>DATA_SHORE_ADMIN_PASSWORD</code> when starting the hub. If you did not, the
              generated password was printed in the hub terminal.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
