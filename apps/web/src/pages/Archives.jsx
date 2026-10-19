import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import ArchiveCard from '../components/ArchiveCard.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { EmptyState, ErrorPanel, SkeletonGrid } from '../components/States.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { useFetch, useDocumentTitle } from '../hooks.js';
import { FILTERS, matchesFilter } from '../utils.js';

const SORTS = [
  { id: 'recent', label: 'Recently synced' },
  { id: 'name', label: 'Title A–Z' },
  { id: 'largest', label: 'Largest' },
  { id: 'files', label: 'Most files' },
];

export default function Archives() {
  useDocumentTitle('Archives');
  const { data, error, loading, reload } = useFetch('/api/archives');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [sortOpen, setSortOpen] = useState(false);

  const archives = data?.archives || [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = archives.filter((archive) => {
      if (needle) {
        const haystack = [archive.title, archive.description, archive.curator, ...(archive.tags || [])]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filter !== 'all') {
        const kinds = archive.stats?.kinds || {};
        if (filter === 'document') {
          if (!(kinds.pdf || kinds.document)) return false;
        } else if (filter === 'text') {
          if (!(kinds.text || kinds.code)) return false;
        } else if (!kinds[filter]) {
          return false;
        }
      }
      return true;
    });
    return list.sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title);
      if (sort === 'largest') return (b.stats?.bytes || 0) - (a.stats?.bytes || 0);
      if (sort === 'files') return (b.stats?.files || 0) - (a.stats?.files || 0);
      return String(b.syncedAt || '').localeCompare(String(a.syncedAt || ''));
    });
  }, [archives, query, filter, sort]);

  const availableKinds = useMemo(() => {
    const kinds = new Set();
    for (const archive of archives) {
      for (const [kind, count] of Object.entries(archive.stats?.kinds || {})) {
        if (count > 0) kinds.add(kind === 'code' ? 'text' : kind === 'document' ? 'pdf' : kind);
      }
    }
    return FILTERS.filter((item) => item.id === 'all' || kinds.has(item.id));
  }, [archives]);

  return (
    <div className="page page-archives">
      <header className="page-head">
        <span className="eyebrow">The collection</span>
        <h1>All archives</h1>
        <p>
          Every folder below lives on someone&apos;s own machine. This shore only keeps the index
          and opens the door.
        </p>
      </header>

      <div className="collection-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={() => {}}
          placeholder="Filter by title, tag, or curator…"
          label="Filter archives"
        />
        <Dropdown
          label="Sort"
          value={SORTS.find((option) => option.id === sort)?.label}
          icon={<SlidersHorizontal size={14} />}
          open={sortOpen}
          onToggle={() => setSortOpen((value) => !value)}
          options={SORTS.map((option) => ({
            id: option.id,
            label: option.label,
            onSelect: () => {
              setSort(option.id);
              setSortOpen(false);
            },
          }))}
        />
      </div>

      <div className="filter-chips" role="group" aria-label="Filter by media type">
        {availableKinds.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip${filter === item.id ? ' is-active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="collection-count">
        {loading ? 'Reading the collection…' : `${filtered.length} ${filtered.length === 1 ? 'archive' : 'archives'}`}
        {query ? ` for “${query}”` : ''}
      </div>

      {loading ? <SkeletonGrid count={6} /> : null}
      {!loading && error ? <ErrorPanel error={error} onRetry={reload} /> : null}
      {!loading && !error && filtered.length === 0 ? (
        <EmptyState
          title={archives.length ? 'No archives match that.' : 'No archives have come ashore yet.'}
          action={
            archives.length ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link to="/console" className="btn btn-primary btn-sm">
                Pair the first folder <ArrowRight size={14} />
              </Link>
            )
          }
        >
          {archives.length
            ? 'Try a different phrase or open the filter back up.'
            : 'A node is a folder plus one small process. Start it, pair it, and the archive appears here.'}
        </EmptyState>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="archive-grid archive-grid-wide">
          {filtered.map((archive, index) => (
            <ArchiveCard key={archive.id} archive={archive} priority={index < 3} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
