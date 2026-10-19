import { Link } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import Logo from './Logo.jsx';
import { useHub } from '../HubContext.js';

export default function Footer() {
  const { data } = useHub();
  const hubName = data?.settings?.hubName || 'Data Shore';
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>{data?.settings?.tagline || 'The public reading room for private drives.'}</p>
          <span className="footer-lock">
            <LockKeyhole size={12} /> Read-only by design
          </span>
        </div>
        <div className="footer-col">
          <h4>Explore</h4>
          <Link to="/archives">All archives</Link>
          <Link to="/search">Search</Link>
          <Link to="/about">How it works</Link>
        </div>
        <div className="footer-col">
          <h4>For curators</h4>
          <Link to="/console">Hub console</Link>
          <Link to="/about">Pair a node</Link>
          <a href="https://github.com/Stellize/Data-Shore" target="_blank" rel="noreferrer">
            Source code
          </a>
        </div>
        <div className="footer-col footer-note">
          <h4>{hubName}</h4>
          <p>
            A quiet place for drives to be seen, not touched. Visitors can look, stream, and
            download — never write.
          </p>
          <span className="footer-fine">© {new Date().getFullYear()} Data Shore</span>
        </div>
      </div>
    </footer>
  );
}
