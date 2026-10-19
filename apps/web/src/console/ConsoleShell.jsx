import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ExternalLink, LayoutDashboard, LogOut, Menu, Settings, Waves, X } from 'lucide-react';
import { LogoMark } from '../components/Logo.jsx';

const NAV = [
  { to: '/console', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/console/settings', label: 'Settings', icon: Settings },
];

export default function ConsoleShell({ children, hubName, onSignOut, demoMode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="console">
      <aside className={`console-side${open ? ' is-open' : ''}`}>
        <div className="console-brand-row">
          <Link to="/console" className="console-brand" onClick={() => setOpen(false)}>
            <LogoMark size={34} />
            <span>
              <strong>{hubName || 'Data Shore'}</strong>
              <small>Hub console</small>
            </span>
          </Link>
          <button
            type="button"
            className="icon-btn console-menu"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Close console menu' : 'Open console menu'}
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {demoMode ? <span className="badge badge-accent console-demo">Demo mode</span> : null}

        <nav className="console-nav" aria-label="Console navigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `console-nav-link${isActive ? ' is-active' : ''}`}
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="console-side-foot">
          <Link to="/" className="console-side-link">
            <ExternalLink size={15} /> View the shore
          </Link>
          <button type="button" className="console-side-link" onClick={onSignOut}>
            <LogOut size={15} /> Sign out
          </button>
          <span className="console-side-note">
            <Waves size={13} /> Read-only by design
          </span>
        </div>
      </aside>

      <main className="console-main">{children}</main>
    </div>
  );
}
