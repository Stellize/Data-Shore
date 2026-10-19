import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  HardDrive,
  KeyRound,
  Link2,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import ArchiveCard from '../components/ArchiveCard.jsx';
import ArchiveCover, { ContourArt } from '../components/ArchiveCover.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import { EmptyState, ErrorPanel, SkeletonGrid } from '../components/States.jsx';
import { useHub } from '../HubContext.js';
import { useFetch, useDocumentTitle } from '../hooks.js';
import {
  formatBytes,
  formatCount,
  formatRelative,
  kindSummary,
} from '../utils.js';

export default function Home() {
  useDocumentTitle();
  const hub = useHub();
  const { data, error, loading, reload } = useFetch('/api/archives');
  const archives = data?.archives || [];
  const featured = archives.find((archive) => archive.featured) || archives[0] || null;
  const stats = hub.data?.stats;

  const metrics = [
    { label: 'Archives', value: stats ? formatCount(stats.archives) : '—' },
    { label: 'Files cataloged', value: stats ? formatCount(stats.files) : '—' },
    { label: 'On the shore', value: stats ? formatBytes(stats.bytes) : '—' },
    { label: 'Nodes paired', value: stats ? formatCount(stats.nodes) : '—' },
  ];

  return (
    <div className="page home">
      {hub.data?.demoMode ? (
        <div className="demo-banner">
          <span className="badge badge-accent">Demo shore</span>
          <p>
            Everything here is sample material. The console password is <code>shore</code>.
          </p>
          <Link to="/console">
            Open the console <ArrowRight size={13} />
          </Link>
        </div>
      ) : null}

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">A read-only shore for your drives</span>
          <h1>
            Your folders, open to <em>read.</em>
            <br />
            Never to touch.
          </h1>
          <p className="hero-lede">{hub.data?.settings?.intro || 'Data Shore turns any folder into a calm, read-only archive. Browse it, stream it, download it — nobody can edit, move, or delete a thing.'}</p>
          <div className="hero-actions">
            <Link to="/archives" className="btn btn-primary btn-lg">
              Browse the archives <ArrowRight size={17} />
            </Link>
            <Link to="/console" className="btn btn-secondary btn-lg">
              Pair a node
            </Link>
          </div>
          <ul className="hero-trust">
            <li>
              <ShieldCheck size={14} /> GET-only nodes
            </li>
            <li>
              <Waves size={14} /> Range streaming
            </li>
            <li>
              <KeyRound size={14} /> Token-paired
            </li>
          </ul>
        </div>

        <div className="hero-art">
          <div className="hero-glow" aria-hidden="true" />
          {featured ? (
            <Link to={`/archives/${featured.slug}`} className="hero-frame">
              <div className="hero-frame-inner">
                <ArchiveCover
                  archive={featured}
                  path={featured.coverPath}
                  alt={`${featured.title} cover`}
                  className="hero-cover"
                  priority
                />
                <div className="hero-frame-shade" />
                <div className="hero-frame-caption">
                  <span className="hero-caption-kicker">Featured archive</span>
                  <h2>{featured.title}</h2>
                  <span className="hero-caption-meta">
                    {formatCount(featured.stats?.files)} files · {kindSummary(featured.stats?.kinds)}
                  </span>
                </div>
                <span className="hero-open">
                  Open <ArrowUpRight size={14} />
                </span>
              </div>
            </Link>
          ) : (
            <div className="hero-frame hero-frame-empty">
              <div className="hero-frame-inner">
                <ContourArt seed="waiting-shore" title="No archive yet" className="hero-cover" />
                <div className="hero-frame-shade" />
                <div className="hero-frame-caption">
                  <span className="hero-caption-kicker">The shore is quiet</span>
                  <h2>No archives yet.</h2>
                  <span className="hero-caption-meta">Pair a folder to start the catalog.</span>
                </div>
              </div>
            </div>
          )}
          <span className="hero-stamp" aria-hidden="true">
            read
            <br />
            only
          </span>
          <div className="hero-specimen" aria-hidden="true">
            <span>DS · 001</span>
            <span>{featured ? formatRelative(featured.syncedAt) : 'awaiting tide'}</span>
          </div>
        </div>
      </section>

      <section className="metrics" aria-label="Shore statistics">
        {metrics.map((metric, index) => (
          <div className="metric" key={metric.label}>
            <span className="metric-index">0{index + 1}</span>
            <span className="metric-value">{metric.value}</span>
            <span className="metric-label">{metric.label}</span>
          </div>
        ))}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Recently on the shore</span>
            <h2 className="section-title">Archives worth a wander.</h2>
          </div>
          {archives.length > 0 ? (
            <Link to="/archives" className="text-link">
              All archives <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>

        {loading ? <SkeletonGrid count={3} /> : null}
        {!loading && error ? <ErrorPanel error={error} onRetry={reload} /> : null}
        {!loading && !error && archives.length === 0 ? (
          <EmptyState
            icon={<HardDrive size={22} />}
            title="The first archive is yours."
            action={
              <Link to="/console" className="btn btn-primary btn-sm">
                Open the console <ArrowRight size={14} />
              </Link>
            }
          >
            Point a node at a folder on your computer, pair it here, and it becomes a public,
            read-only archive.
          </EmptyState>
        ) : null}
        {!loading && archives.length > 0 ? (
          <div className="archive-grid">
            {archives.slice(0, 6).map((archive, index) => (
              <ArchiveCard key={archive.id} archive={archive} priority={index < 3} />
            ))}
          </div>
        ) : null}
      </section>

      <section className="section how-it-works">
        <div className="section-head">
          <div>
            <span className="eyebrow">The arrangement</span>
            <h2 className="section-title">Your drive stays home. The shore stays open.</h2>
          </div>
          <p className="section-sub">
            A tiny node on your machine reads the folder. The hub only ever asks it for bytes.
            Nothing flows back upstream.
          </p>
        </div>

        <div className="step-grid">
          <article className="step-card">
            <span className="step-number">01</span>
            <span className="step-icon">
              <HardDrive size={20} />
            </span>
            <h3>Point at a folder</h3>
            <p>
              Run the node on the computer that holds the files. It scans once and exposes a
              GET-only API for that folder.
            </p>
          </article>
          <article className="step-card">
            <span className="step-number">02</span>
            <span className="step-icon">
              <ScanLine size={20} />
            </span>
            <h3>Paste the pairing code</h3>
            <p>
              The hub calls the node, reads its catalog, and builds this public library. The node
              token never reaches a visitor.
            </p>
          </article>
          <article className="step-card">
            <span className="step-number">03</span>
            <span className="step-icon">
              <Link2 size={20} />
            </span>
            <h3>Share the shore</h3>
            <p>
              Anyone with the link can browse, stream video with range requests, and download.
              There is no write path to protect.
            </p>
          </article>
        </div>

        <div className="how-command">
          <CodeBlock label="On the machine holding your files">
            npm run node -- --root "/Volumes/Archive" --name "Home archive"
          </CodeBlock>
          <div className="how-command-note">
            <LockKeyhole size={16} />
            <p>
              Publishing never uploads your files to a stranger&apos;s bucket. The node keeps the
              bytes; the hub keeps a catalog and a doorway.
            </p>
          </div>
        </div>
      </section>

      <section className="promise-band">
        <div className="promise-copy">
          <span className="eyebrow">Safety rails</span>
          <h2>A reader, never an editor.</h2>
          <p>
            Data Shore was designed around a single rule: the web may look, but it may not write.
            Every layer assumes visitors are guests.
          </p>
          <Link to="/about" className="text-link">
            Read the design notes <ArrowRight size={14} />
          </Link>
        </div>
        <ul className="promise-list">
          <li>
            <ShieldCheck size={18} />
            <div>
              <h3>GET-only nodes</h3>
              <p>Upload, rename, and delete endpoints simply do not exist.</p>
            </div>
          </li>
          <li>
            <LockKeyhole size={18} />
            <div>
              <h3>A path jail</h3>
              <p>Traversal, null bytes, and symlinks that escape the share are refused.</p>
            </div>
          </li>
          <li>
            <KeysIcon />
            <div>
              <h3>Quiet active content</h3>
              <p>HTML and scripts are served as plain text, never executed by the hub.</p>
            </div>
          </li>
          <li>
            <Download size={18} />
            <div>
              <h3>Downloads, at your door</h3>
              <p>Downloading can be switched off per archive without losing streaming.</p>
            </div>
          </li>
        </ul>
      </section>

      <section className="cta-band">
        <div>
          <span className="eyebrow">Your move</span>
          <h2>Have a folder? Give it a shore.</h2>
          <p>Pair a node in under a minute. Keep your files exactly where they are.</p>
        </div>
        <div className="cta-actions">
          <Link to="/console" className="btn btn-primary btn-lg">
            Open the console <ArrowRight size={17} />
          </Link>
          <Link to="/about" className="btn btn-secondary btn-lg">
            Read the setup
          </Link>
        </div>
      </section>
    </div>
  );
}

function KeysIcon() {
  return <KeyRound size={18} />;
}
