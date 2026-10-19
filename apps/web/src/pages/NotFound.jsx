import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { useDocumentTitle } from '../hooks.js';

export default function NotFound() {
  useDocumentTitle('Not found');
  return (
    <div className="page not-found">
      <span className="not-found-mark" aria-hidden="true">
        <Compass size={34} />
      </span>
      <span className="eyebrow">Off the chart</span>
      <h1>This path has no shore.</h1>
      <p>The page you asked for is not in the catalog — perhaps the tide moved it.</p>
      <div className="not-found-actions">
        <Link to="/" className="btn btn-primary">
          <ArrowLeft size={15} /> Back home
        </Link>
        <Link to="/archives" className="btn btn-secondary">
          Browse archives
        </Link>
      </div>
    </div>
  );
}
