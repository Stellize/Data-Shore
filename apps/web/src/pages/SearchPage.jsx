import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import ResultRow from '../components/ResultRow.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { EmptyState, ErrorPanel, LoadingBlock } from '../components/States.jsx';
import { useDocumentTitle, useFetch } from '../hooks.js';
import { formatCount } from '../utils.js';

const SUGGESTIONS = [
  { label: 'kind:image', query: 'kind:image' },
  { label: 'kind:video', query: 'kind:video' },
  { label: 'kind:audio', query: 'kind:audio' },
  { label: 'ext:pdf', query: 'ext:pdf' },
];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const query = params.get('q') || '';
  const [input, setInput] = useState(query);
  const [archiveFilter, setArchiveFilter] = useState('');
  const { data, error, loading, reload } = useFetch(
    query ? `/api/search?q=${encodeURIComponent(query)}` : null,
  );

  useDocumentTitle(query ? `Search · ${query}` : 'Search');

  useEffect(() => {
    setInput(query);
    setArchiveFilter('');
  }, [query]);

  const results = useMemo(() => {
    const list = data?.results || [];
    return archiveFilter ? list.filter((item) => item.archive.slug === archiveFilter) : list;
  }, [data, archiveFilter]);

  const submit = (value) => {
    const next = String(value || '').trim();
    setParams(next ? { q: next } : {}, { replace: false });
  };

  const openResult = (entry) => {
    const archiveSlug = entry.archive?.slug || results[0]?.archive?.slug;
    if (!archiveSlug) return;
    if (entry.type === 'dir') {
      navigate(`/archives/${archiveSlug}?path=${encodeURIComponent(entry.path)}`);
    } else {
      navigate(`/archives/${archiveSlug}?file=${encodeURIComponent(entry.path)}`);
    }
  };

  return (
    <div className="page page-search">
      <header className="page-head search-head">
        <span className="eyebrow">Search the shore</span>
        <h1>Find a file across every archive.</h1>
        <p>
          Names and paths, not contents. Search supports <code>kind:image</code>,{' '}
          <code>ext:pdf</code>, and <code>folder:tides</code> filters.
        </p>
        <SearchBox
          value={input}
          onChange={setInput}
          onSubmit={submit}
          placeholder="Try “harbor”, “kind:video”, or “ext:pdf”"
          label="Search all archives"
          size="lg"
          autoFocus
          busy={loading}
        />
        <div className="search-suggestions">
          {SUGGESTIONS.map((item) => (
            <button
              key={item.query}
              type="button"
              className="chip chip-small"
              onClick={() => {
                setInput(item.query);
                submit(item.query);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {!query ? (
        <EmptyState icon={<SearchIcon size={22} />} title="The catalog is waiting for a word.">
          Search is name-based, so a partial filename is enough. Folders appear too, ready to open.
        </EmptyState>
      ) : null}

      {loading ? <LoadingBlock label={`Searching for “${query}”…`} /> : null}
      {!loading && error ? <ErrorPanel error={error} onRetry={reload} /> : null}

      {!loading && !error && data ? (
        <>
          <div className="search-summary">
            <div>
              <strong>{formatCount(data.total)}</strong> {data.total === 1 ? 'match' : 'matches'} for{' '}
              <em>“{query}”</em> across {data.archives.length}{' '}
              {data.archives.length === 1 ? 'archive' : 'archives'}
            </div>
            {data.archives.length > 1 ? (
              <div className="search-facets">
                <button
                  type="button"
                  className={`chip chip-small${archiveFilter === '' ? ' is-active' : ''}`}
                  onClick={() => setArchiveFilter('')}
                >
                  All archives
                </button>
                {data.archives.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    className={`chip chip-small${archiveFilter === item.slug ? ' is-active' : ''}`}
                    onClick={() => setArchiveFilter(item.slug)}
                  >
                    {item.title} <span className="chip-count">{item.matches}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {results.length === 0 ? (
            <EmptyState title="No files match that phrase.">
              Try fewer characters, a different filter, or browse an archive directly.
            </EmptyState>
          ) : (
            <div className="result-list">
              {results.map((entry) => (
                <ResultRow
                  key={`${entry.archive.slug}:${entry.path}`}
                  entry={entry}
                  archive={entry.archive}
                  query={query}
                  onOpen={openResult}
                  showArchive
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
