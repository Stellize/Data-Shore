import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  EyeOff,
  FolderOpen,
  Grid2X2,
  List,
  LockKeyhole,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import ArchiveCover from '../components/ArchiveCover.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import Dropdown from '../components/Dropdown.jsx';
import FileTile, { FolderCard } from '../components/FileTile.jsx';
import FileViewer from '../components/FileViewer.jsx';
import KindIcon from '../components/KindIcon.jsx';
import ResultRow from '../components/ResultRow.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { EmptyState, ErrorPanel, LoadingBlock, SkeletonGrid } from '../components/States.jsx';
import { archivePath, streamUrl } from '../api.js';
import { useDocumentTitle, useFetch } from '../hooks.js';
import {
  FILTERS,
  formatBytes,
  formatCount,
  formatRelative,
  kindSummary,
  matchesFilter,
} from '../utils.js';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const SORTS = [
  { id: 'name', label: 'Name A–Z' },
  { id: 'newest', label: 'Newest first' },
  { id: 'largest', label: 'Largest first' },
];

export default function Archive() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const path = params.get('path') || '';
  const query = params.get('q') || '';
  const fileParam = params.get('file') || '';
  const [searchInput, setSearchInput] = useState(query);
  const [sortOpen, setSortOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [view, setView] = useState(() => {
    try {
      return window.localStorage.getItem('ds:view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const searchRef = useRef(null);

  const patchParams = useCallback(
    (updates, { replace = true } = {}) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  const detailUrl = `${archivePath(slug)}${path ? `?path=${encodeURIComponent(path)}` : ''}`;
  const { data, error, loading, reload } = useFetch(detailUrl);
  const searchUrl = query ? `${archivePath(slug)}/search?q=${encodeURIComponent(query)}` : null;
  const search = useFetch(searchUrl);

  useDocumentTitle(data?.archive?.title || (slug ? slug.replaceAll('-', ' ') : 'Archive'));

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    const next = searchInput.trim();
    if (next === query) return undefined;
    const timer = window.setTimeout(() => {
      patchParams({ q: next || null, file: null });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [searchInput, query, patchParams]);

  useEffect(() => {
    try {
      window.localStorage.setItem('ds:view', view);
    } catch {
      // ignore storage failures
    }
  }, [view]);

  const archive = data?.archive || null;
  const entries = data?.entries || [];
  const searchResults = search.data?.results || [];
  const isSearching = Boolean(query);

  const goFolder = useCallback(
    (nextPath) => {
      setFilter('all');
      patchParams(
        { path: nextPath || null, q: null, file: null },
        { replace: false },
      );
    },
    [patchParams],
  );

  const openFile = useCallback(
    (filePath) => {
      patchParams({ file: filePath || null });
    },
    [patchParams],
  );

  const closeFile = useCallback(() => {
    patchParams({ file: null });
  }, [patchParams]);

  const openFolderFromViewer = useCallback(
    (folder) => {
      goFolder(folder);
    },
    [goFolder],
  );

  const visibleEntries = useMemo(() => {
    const list = entries.filter((entry) => matchesFilter(entry, filter));
    const folders = list.filter((entry) => entry.type === 'dir');
    folders.sort((a, b) => collator.compare(a.name, b.name));
    const files = list.filter((entry) => entry.type === 'file');
    files.sort((a, b) => {
      if (sort === 'newest') return String(b.mtime).localeCompare(String(a.mtime));
      if (sort === 'largest') return (b.size || 0) - (a.size || 0);
      return collator.compare(a.name, b.name);
    });
    return { folders, files };
  }, [entries, filter, sort]);

  const visibleResults = useMemo(
    () => searchResults.filter((entry) => matchesFilter(entry, filter)),
    [searchResults, filter],
  );

  const viewerFiles = useMemo(() => {
    const source = isSearching ? visibleResults : visibleEntries.files;
    return source.filter((entry) => entry.type === 'file');
  }, [isSearching, visibleResults, visibleEntries.files]);

  const viewerIndex = viewerFiles.findIndex((entry) => entry.path === fileParam);
  const viewerHasPrev = viewerIndex > 0;
  const viewerHasNext = viewerIndex >= 0 && viewerIndex < viewerFiles.length - 1;

  const navigateViewer = (delta) => {
    if (viewerIndex < 0) return;
    const next = viewerFiles[viewerIndex + delta];
    if (next) openFile(next.path);
  };

  const availableFilters = useMemo(() => {
    const kinds = archive?.stats?.kinds || {};
    const present = new Set(
      Object.entries(kinds)
        .filter(([, count]) => count > 0)
        .map(([kind]) => (kind === 'code' ? 'text' : kind === 'document' ? 'pdf' : kind)),
    );
    return FILTERS.filter((item) => item.id === 'all' || present.has(item.id));
  }, [archive]);

  if (loading && !data) {
    return (
      <div className="page archive-page">
        <div className="archive-skeleton-head">
          <div className="skeleton skeleton-line w-30" />
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line w-60" />
        </div>
        <LoadingBlock compact label="Opening the archive…" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page archive-page">
        <Link to="/archives" className="back-link">
          <ArrowLeft size={14} /> All archives
        </Link>
        <ErrorPanel
          error={error}
          onRetry={reload}
          title={error.status === 409 ? 'Still cataloging.' : 'That archive is out of reach.'}
        />
      </div>
    );
  }

  if (!archive) return null;

  const folder = data?.folder;
  const stats = archive.stats || {};
  const totalMatches = search.data?.total ?? 0;
  const showSearchResults = isSearching;
  const filesCount = isSearching ? visibleResults.filter((e) => e.type === 'file').length : visibleEntries.files.length;

  return (
    <div className="page archive-page">
      <div className="page-crumbs">
        <Link to="/archives" className="back-link">
          <ArrowLeft size={14} /> All archives
        </Link>
        <span className="page-crumbs-sep">/</span>
        <span className="page-crumbs-current">{archive.title}</span>
      </div>

      {!path ? (
        <header className="archive-hero">
          <div className="archive-hero-copy">
            <div className="archive-hero-kicker">
              <span className="badge badge-accent">
                <LockKeyhole size={11} /> Read-only archive
              </span>
              {archive.featured ? (
                <span className="badge badge-quiet">
                  <Sparkles size={11} /> Featured
                </span>
              ) : null}
              {archive.visibility === 'unlisted' ? (
                <span className="badge badge-quiet">
                  <EyeOff size={11} /> Unlisted
                </span>
              ) : null}
            </div>
            <h1>{archive.title}</h1>
            <p className="archive-lede">
              {archive.description ||
                'A folder published from a private drive, open for reading only.'}
            </p>
            {archive.tags?.length ? (
              <div className="archive-tags">
                {archive.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="archive-hero-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => searchRef.current?.focus()}
              >
                <Search size={15} /> Search this archive
              </button>
              {archive.curator ? (
                <span className="archive-curator">Curated by {archive.curator}</span>
              ) : null}
            </div>
          </div>
          <figure className="archive-hero-art">
            <ArchiveCover
              archive={archive}
              path={archive.coverPath}
              alt={`${archive.title} cover`}
              className="archive-hero-img"
              priority
            />
            <span className="archive-stamp">read · only</span>
            <figcaption>
              <span className="mono-label">Archive</span>
              <span>{formatRelative(archive.syncedAt)}</span>
            </figcaption>
          </figure>
        </header>
      ) : (
        <header className="folder-hero">
          <span className="eyebrow">Folder</span>
          <h1>{folder?.name || path.split('/').pop()}</h1>
          <p>
            {formatCount(folder?.fileCount)} files · {formatBytes(folder?.size)} ·{' '}
            {formatRelative(folder?.mtime)}
          </p>
        </header>
      )}

      {!path ? (
        <div className="archive-facts">
          <div>
            <span>Files</span>
            <strong>{formatCount(stats.files)}</strong>
          </div>
          <div>
            <span>Folders</span>
            <strong>{formatCount(stats.folders)}</strong>
          </div>
          <div>
            <span>Volume</span>
            <strong>{formatBytes(stats.bytes)}</strong>
          </div>
          <div>
            <span>Last synced</span>
            <strong>{formatRelative(archive.syncedAt)}</strong>
          </div>
          <div className="archive-facts-kinds">
            <span>Contents</span>
            <strong>{kindSummary(stats.kinds) || '—'}</strong>
          </div>
        </div>
      ) : null}

      {!path && data?.highlights?.gallery?.length ? (
        <section className="plates">
          <div className="plates-head">
            <span className="eyebrow">From the archive</span>
            <span className="plates-count">{data.highlights.gallery.length} recent images</span>
          </div>
          <div className="plate-row">
            {data.highlights.gallery.slice(0, 6).map((image) => (
              <button
                type="button"
                className="plate"
                key={image.path}
                onClick={() => openFile(image.path)}
                title={image.name}
              >
                <img src={streamUrl(archive.slug, image.path)} alt="" loading="lazy" decoding="async" />
                <span>{image.name}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="archive-toolbar">
        <Breadcrumbs archive={archive} crumbs={data?.breadcrumbs || []} onNavigate={goFolder} />
        <div className="archive-toolbar-controls">
          <SearchBox
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search everything in this archive…"
            label="Search this archive"
            inputRef={searchRef}
            busy={Boolean(query) && search.loading}
          />
          {!showSearchResults ? (
            <Dropdown
              label="Sort"
              value={SORTS.find((option) => option.id === sort)?.label}
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
          ) : null}
          <div className="view-switch" role="group" aria-label="Layout">
            <button
              type="button"
              className={view === 'grid' ? 'is-active' : ''}
              onClick={() => setView('grid')}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
            >
              <Grid2X2 size={15} />
            </button>
            <button
              type="button"
              className={view === 'list' ? 'is-active' : ''}
              onClick={() => setView('list')}
              aria-label="List view"
              aria-pressed={view === 'list'}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="filter-chips">
        {availableFilters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip${filter === item.id ? ' is-active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label === 'PDFs' ? 'PDFs & docs' : item.label}
          </button>
        ))}
        {archive.downloads === false ? (
          <span className="chip chip-static">
            <Download size={12} /> Downloads off
          </span>
        ) : null}
      </div>

      {showSearchResults ? (
        <section className="archive-search">
          <div className="archive-search-head">
            <p>
              {search.loading ? (
                'Searching the catalog…'
              ) : (
                <>
                  <strong>{formatCount(totalMatches)}</strong>{' '}
                  {totalMatches === 1 ? 'match' : 'matches'} for “{query}” across {archive.title}
                </>
              )}
            </p>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setSearchInput('');
                patchParams({ q: null, file: null });
              }}
            >
              <X size={13} /> Clear search
            </button>
          </div>
          {search.error ? <ErrorPanel error={search.error} onRetry={search.reload} /> : null}
          {!search.loading && !search.error && visibleResults.length === 0 ? (
            <EmptyState title="No matches on this shore.">
              Try a partial name, an extension like <code>kind:video</code>, or open a folder and
              browse.
            </EmptyState>
          ) : null}
          {visibleResults.length > 0 ? (
            <div className="result-list">
              {visibleResults.map((entry) => (
                <ResultRow
                  key={entry.path}
                  entry={entry}
                  query={query}
                  onOpen={(item) =>
                    item.type === 'dir' ? goFolder(item.path) : openFile(item.path)
                  }
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <>
          {visibleEntries.folders.length > 0 ? (
            <section className="folders">
              <div className="mini-head">
                <h2>Folders</h2>
                <span>{visibleEntries.folders.length}</span>
              </div>
              <div className="folder-grid">
                {visibleEntries.folders.map((entry) => (
                  <FolderCard key={entry.path} entry={entry} onOpen={goFolder} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="files">
            <div className="mini-head">
              <h2>{filter === 'all' ? 'Files' : FILTERS.find((item) => item.id === filter)?.label}</h2>
              <span>{formatCount(filesCount)}</span>
            </div>
            {visibleEntries.files.length === 0 ? (
              <EmptyState
                title={
                  filter === 'all'
                    ? path
                      ? 'This folder is empty.'
                      : 'Nothing at the root, yet.'
                    : 'No files of that kind here.'
                }
                action={
                  filter !== 'all' ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilter('all')}>
                      Show everything
                    </button>
                  ) : null
                }
              >
                {filter === 'all'
                  ? 'Files added to the source folder appear after the next sync.'
                  : 'Try another filter, or search the whole archive.'}
              </EmptyState>
            ) : view === 'grid' ? (
              <div className="file-grid">
                {visibleEntries.files.map((entry) => (
                  <FileTile
                    key={entry.path}
                    entry={entry}
                    archive={archive}
                    onOpen={openFile}
                    view="grid"
                  />
                ))}
              </div>
            ) : (
              <div className="file-list">
                {visibleEntries.files.map((entry) => (
                  <FileTile
                    key={entry.path}
                    entry={entry}
                    archive={archive}
                    onOpen={openFile}
                    view="list"
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <div className="archive-foot">
        <span>
          <LockKeyhole size={13} /> This archive is read-only. Files live on the publisher&apos;s own
          node.
        </span>
        <span>{formatCount(stats.files)} files · synced {formatRelative(archive.syncedAt)}</span>
      </div>

      <FileViewer
        key={fileParam}
        open={Boolean(fileParam)}
        archive={archive}
        filePath={fileParam}
        onClose={closeFile}
        onPrev={() => navigateViewer(-1)}
        onNext={() => navigateViewer(1)}
        hasPrev={viewerHasPrev}
        hasNext={viewerHasNext}
        onOpenFolder={openFolderFromViewer}
      />
    </div>
  );
}
