import { Link } from 'react-router-dom';

export function LogoMark({ size = 34 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Data Shore mark"
      className="logo-mark"
    >
      <rect width="40" height="40" rx="11" fill="var(--logo-bg, #0c2731)" />
      <circle cx="28.2" cy="12.4" r="3.2" fill="#f0b27a" />
      <path
        d="M7 23.8c4.2-3.2 7.3 3.2 11.6 0s7.3 3.2 14.2-1.2"
        fill="none"
        stroke="#6fdcc6"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M7 29.6c4.2-3.2 7.3 3.2 11.6 0s7.3 3.2 14.2-1.2"
        fill="none"
        stroke="#cfe9e1"
        strokeOpacity=".55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Logo({ to = '/', note = null, size = 34 }) {
  return (
    <Link to={to} className="logo" aria-label="Data Shore home">
      <LogoMark size={size} />
      <span className="logo-type">
        <span className="logo-word">Data Shore</span>
        {note ? <span className="logo-note">{note}</span> : null}
      </span>
    </Link>
  );
}
