import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Breadcrumbs({ archive, crumbs = [], onNavigate }) {
  const trail = crumbs.filter((crumb) => crumb.path !== '');
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link
        to={`/archives/${archive.slug}`}
        onClick={(event) => {
          if (!onNavigate) return;
          event.preventDefault();
          onNavigate('');
        }}
        className="crumb crumb-home"
      >
        <Home size={13} />
        <span>{archive.title}</span>
      </Link>
      {trail.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span className="crumb-group" key={crumb.path}>
            <ChevronRight size={12} className="crumb-sep" aria-hidden="true" />
            {last ? (
              <span className="crumb crumb-current" aria-current="page">
                {crumb.name}
              </span>
            ) : (
              <button type="button" className="crumb" onClick={() => onNavigate?.(crumb.path)}>
                {crumb.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
