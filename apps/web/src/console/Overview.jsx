import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Database,
  ExternalLink,
  FileStack,
  HardDrive,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ArchiveCover from '../components/ArchiveCover.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import { ErrorPanel, SkeletonGrid } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import PairingPanel from './PairingPanel.jsx';
import SyncState, { StatusPill } from './SyncState.jsx';
import { useConsole } from './ConsoleContext.jsx';
import { useFetch, useDocumentTitle } from '../hooks.js';
import { api } from '../api.js';
import { formatBytes, formatCount, formatRelative, kindSummary } from '../utils.js';

const ACTIVITY_LABELS = {
  'archive.created': 'Archive published',
  'archive.synced': 'Catalog refreshed',
  'archive.sync_failed': 'Sync failed',
};

export default function Overview() {
  useDocumentTitle('Console');
  const { onExpired, demoMode } = useConsole();
  const navigate = useNavigate();
  const { push } = useToast();
  const [syncing, setSyncing] = useState(false);
  const overview = useFetch('/api/console/overview', {
    pollMs: syncing ? 2400 : 0,
  });

  const data = overview.data;
  const error = overview.error;
  const loading = overview.loading && !data;

  const anySyncing = Boolean(
    data?.archives?.some((archive) => archive.sync || archive.status === 'syncing'),
  );

  useEffect(() => {
    setSyncing(anySyncing);
  }, [anySyncing]);

  const totals = useMemo(() => {
    const archives = data?.archives || [];
    let files = 0;
    let bytes = 0;
    const nodes = new Set();
    for (const archive of archives) {
      files += archive.stats?.files || 0;
      bytes += archive.stats?.bytes || 0;
      if (archive.node?.url) nodes.add(archive.node.url);
    }
    return { files, bytes, nodes: nodes.size };
  }, [data]);

  const onCreated = (archive) => {
    overview.reload();
    navigate(`/console/archives/${archive.id}`);
  };

  const copyViewLink = async (archive) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/archives/${archive.slug}`);
      push('Public link copied.', { tone: 'success' });
    } catch {
      push('Could not copy the link.', { tone: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="console-view">
        <div className="console-head">
          <div>
            <span className="eyebrow">Hub console</span>
            <h1>Overview</h1>
          </div>
        </div>
        <SkeletonGrid count={3} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="console-view">
        <ErrorPanel
          error={error}
          title="The console could not load."
          onRetry={overview.reload}
        />
      </div>
    );
  }

  const archives = data?.archives || [];
  const activity = data?.activity || [];
  const stats = [
    {
      label: 'Managed archives',
      value: formatCount(archives.length),
      icon: <Database size={17} />,
      note: `${archives.filter((archive) => archive.status === 'live').length} live`,
    },
    {
      label: 'Files in catalogs',
      value: formatCount(totals.files),
      icon: <FileStack size={17} />,
      note: 'names and sizes only',
    },
    {
      label: 'Within reach',
      value: formatBytes(totals.bytes),
      icon: <HardDrive size={17} />,
      note: 'streamed on demand',
    },
    {
      label: 'Nodes paired',
      value: formatCount(totals.nodes),
      icon: <Server size={17} />,
      note: 'tokens held server-side',
    },
  ];

  return (
    <div className="console-view">
      <header className="console-head">
        <div>
          <span className="eyebrow">Hub console</span>
          <h1>Overview</h1>
          <p>Pair nodes, curate the public labels, and pull fresh catalogs.</p>
        </div>
        <div className="console-head-actions">
          <Link to="/" className="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">
            View the shore <ExternalLink size={14} />
          </Link>
        </div>
      </header>

      {demoMode ? (
        <div className="console-demo-note">
          <span className="badge badge-accent">Demo mode</span>
          <p>
            These archives are seeded from the repository&apos;s <code>demo/</code> folders. Pairing
            works with real nodes too — start one and paste its code below.
          </p>
        </div>
      ) : null}

      <div className="console-stat-grid">
        {stats.map((stat) => (
          <div className="console-stat" key={stat.label}>
            <span className="console-stat-icon">{stat.icon}</span>
            <span className="console-stat-value">{stat.value}</span>
            <span className="console-stat-label">{stat.label}</span>
            <span className="console-stat-note">{stat.note}</span>
          </div>
        ))}
      </div>

      <div className="console-columns">
        <div className="console-primary">
          <PairingPanel onCreated={onCreated} defaultOpen={archives.length === 0} />

          <section className="panel managed">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Your shelves</span>
                <h2>Managed archives</h2>
                <p>Each archive mirrors one share on one node.</p>
              </div>
              <span className="count-pill">{formatCount(archives.length)}</span>
            </div>

            {archives.length === 0 ? (
              <div className="managed-empty">
                <span className="managed-empty-icon">
                  <HardDrive size={22} />
                </span>
                <h3>No archives paired yet.</h3>
                <p>
                  Start a node beside a folder, paste its pairing code above, and this shelf fills
                  up.
                </p>
              </div>
            ) : (
              <div className="managed-list">
                {archives.map((archive) => (
                  <article className="managed-item" key={archive.id}>
                    <Link to={`/console/archives/${archive.id}`} className="managed-cover">
                      <ArchiveCover
                        archive={archive}
                        path={archive.coverPath}
                        alt=""
                        className="managed-cover-img"
                      />
                    </Link>
                    <div className="managed-body">
                      <div className="managed-title">
                        <Link to={`/console/archives/${archive.id}`}>{archive.title}</Link>
                        <StatusPill archive={archive} />
                        {archive.visibility === 'unlisted' ? (
                          <span className="badge badge-quiet">Unlisted</span>
                        ) : null}
                      </div>
                      <p className="managed-desc">
                        {archive.description || 'No description yet.'}
                      </p>
                      <div className="managed-meta">
                        <span>{formatCount(archive.stats?.files)} files</span>
                        <span>{formatBytes(archive.stats?.bytes)}</span>
                        <span>{kindSummary(archive.stats?.kinds) || 'cataloging'}</span>
                        <span>
                          {archive.syncedAt
                            ? `synced ${formatRelative(archive.syncedAt)}`
                            : 'never synced'}
                        </span>
                      </div>
                      {archive.sync || archive.status === 'error' ? (
                        <SyncState archive={archive} compact />
                      ) : null}
                    </div>
                    <div className="managed-actions">
                      <Link to={`/console/archives/${archive.id}`} className="btn btn-secondary btn-sm">
                        Manage
                      </Link>
                      {archive.syncedAt ? (
                        <div className="managed-links">
                          <Link to={`/archives/${archive.slug}`} target="_blank" className="text-btn">
                            View <ArrowUpRight size={13} />
                          </Link>
                          <button type="button" className="text-btn" onClick={() => copyViewLink(archive)}>
                            Copy link
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="console-aside">
          <section className="panel console-help">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Quick start</span>
                <h2>Start a node</h2>
              </div>
            </div>
            <ol className="console-steps">
              <li>
                <span>1</span>
                <p>On the machine with your files, run:</p>
              </li>
            </ol>
            <CodeBlock label="Node machine">
              npm run node -- --root "/Volumes/Archive" --name "Home archive"
            </CodeBlock>
            <ol className="console-steps console-steps-rest" start={2}>
              <li>
                <span>2</span>
                <p>Copy the pairing code printed in that terminal.</p>
              </li>
              <li>
                <span>3</span>
                <p>Paste it into “Pair a node” and choose a share.</p>
              </li>
            </ol>
            <p className="console-help-note">
              <ShieldCheck size={13} /> Nodes only answer GET requests, so there is no write path
              to guard.
            </p>
          </section>

          <section className="panel activity">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Logbook</span>
                <h2>Recent activity</h2>
              </div>
              <Activity size={16} className="panel-head-icon" />
            </div>
            {activity.length === 0 ? (
              <p className="activity-empty">Nothing has happened yet. Pair a node to begin.</p>
            ) : (
              <ul className="activity-list">
                {activity.slice(0, 10).map((item, index) => (
                  <li key={`${item.at}-${index}`}>
                    <span className={`activity-dot activity-${item.type}`} />
                    <div>
                      <p>{ACTIVITY_LABELS[item.type] || 'Activity'}</p>
                      <span>
                        {item.archiveTitle ? `${item.archiveTitle} · ` : ''}
                        {formatRelative(item.at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel console-aside-note">
            <Sparkles size={16} />
            <p>
              Only this console can add archives. The public shore is read-only and needs no
              visitor accounts.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
