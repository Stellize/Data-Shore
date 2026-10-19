import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Menu, Search, X } from 'lucide-react';
import Logo from './Logo.jsx';
import { useHub } from '../HubContext.js';

const NAV = [
  { to: '/archives', label: 'Archives' },
  { to: '/about', label: 'How it works' },
];

export default function TopBar() {
  const { data } = useHub();
  const navigate = useNavigate();
  const location = useLocation();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event) => {
      const tag = document.activeElement?.tagName;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const query = term.trim();
    setOpen(false);
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/archives');
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <Logo />
          {data?.demoMode ? <span className="demo-pill">Demo</span> : null}
        </div>

        <nav className="topbar-nav" aria-label="Main navigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-right">
          <form className="topbar-search" role="search" onSubmit={submit}>
            <Search size={15} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search the shore"
              aria-label="Search all archives"
              spellCheck="false"
            />
            <kbd>/</kbd>
          </form>
          <Link to="/console" className="topbar-console" aria-label="Hub console">
            <LayoutDashboard size={16} />
            <span>Console</span>
          </Link>
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mobile-menu">
          <form className="mobile-search" role="search" onSubmit={submit}>
            <Search size={16} />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search all archives"
              aria-label="Search all archives"
            />
          </form>
          <nav aria-label="Mobile navigation">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className="mobile-link">
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/console" className="mobile-link">
              Hub console
            </NavLink>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
