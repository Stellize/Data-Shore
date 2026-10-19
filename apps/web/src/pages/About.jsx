import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Download,
  HardDrive,
  KeyRound,
  LockKeyhole,
  RadioTower,
  ScanLine,
  Server,
  ShieldCheck,
  Users,
  Waypoints,
} from 'lucide-react';
import CodeBlock from '../components/CodeBlock.jsx';
import { useHub } from '../HubContext.js';
import { useDocumentTitle } from '../hooks.js';
import { formatBytes, formatCount } from '../utils.js';

const SAFETY = [
  {
    icon: <ShieldCheck size={19} />,
    title: 'GET-only API',
    text: 'The node has no upload, rename, or delete endpoints at all — a write request gets a 405 before it reaches the filesystem.',
  },
  {
    icon: <LockKeyhole size={19} />,
    title: 'A path jail',
    text: 'Every path is normalized and resolved against the share root. Traversal, null bytes, and symlinks that point outside are refused.',
  },
  {
    icon: <KeyRound size={19} />,
    title: 'Tokens stay server-side',
    text: 'The browser never sees a node token. The hub holds credentials and proxies only the files in its own catalog.',
  },
  {
    icon: <Download size={19} />,
    title: 'Downloads are a switch',
    text: 'Turn downloads off per archive and the stream endpoint refuses attachment requests while previews keep working.',
  },
  {
    icon: <ShieldCheck size={19} />,
    title: 'No active content',
    text: 'HTML, SVG, and XML are forced to text/plain or attachment, with a sandboxed CSP. The hub never executes archive content.',
  },
  {
    icon: <ScanLine size={19} />,
    title: 'A catalog, not a copy',
    text: 'Only metadata is stored here. Bytes stream from your node on demand, so the archive stays where you put it.',
  },
];

export default function About() {
  useDocumentTitle('How it works');
  const hub = useHub();
  const stats = hub.data?.stats;

  return (
    <div className="page page-about">
      <header className="about-hero">
        <span className="eyebrow">How it works</span>
        <h1>A reader, never an editor.</h1>
        <p>
          Data Shore is split in two: a small <strong>node</strong> that lives beside your files, and
          a public <strong>hub</strong> that keeps the catalog and the door. Visitors can look,
          stream, and download. Nothing in the design can write back.
        </p>
        <div className="about-stats">
          <div>
            <strong>{stats ? formatCount(stats.archives) : '—'}</strong>
            <span>archives on this shore</span>
          </div>
          <div>
            <strong>{stats ? formatCount(stats.files) : '—'}</strong>
            <span>files cataloged</span>
          </div>
          <div>
            <strong>{stats ? formatBytes(stats.bytes) : '—'}</strong>
            <span>bytes within reach</span>
          </div>
        </div>
      </header>

      <section className="section about-flow-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">The route</span>
            <h2 className="section-title">Bytes stay home. Catalogs travel.</h2>
          </div>
          <p className="section-sub">
            The hub asks the node for a catalog once, then streams files back through its own
            doorway when someone presses play.
          </p>
        </div>
        <div className="flow" role="img" aria-label="Your folder, to node, to hub, to visitors">
          <div className="flow-card">
            <span className="flow-icon">
              <HardDrive size={20} />
            </span>
            <h3>Your folder</h3>
            <p>Any folder or mounted drive. It never leaves your machine.</p>
            <span className="flow-tag">source</span>
          </div>
          <span className="flow-arrow" aria-hidden="true">
            <Waypoints size={16} />
            <i />
          </span>
          <div className="flow-card flow-card-accent">
            <span className="flow-icon">
              <Server size={20} />
            </span>
            <h3>Shore node</h3>
            <p>Reads the folder, serves GET only, checks paths and tokens.</p>
            <span className="flow-tag">GET-only</span>
          </div>
          <span className="flow-arrow" aria-hidden="true">
            <RadioTower size={16} />
            <i />
          </span>
          <div className="flow-card">
            <span className="flow-icon">
              <ScanLine size={20} />
            </span>
            <h3>Hub</h3>
            <p>Keeps the public catalog, search, and the streaming proxy.</p>
            <span className="flow-tag">this site</span>
          </div>
          <span className="flow-arrow" aria-hidden="true">
            <Users size={16} />
            <i />
          </span>
          <div className="flow-card">
            <span className="flow-icon">
              <Users size={20} />
            </span>
            <h3>Visitors</h3>
            <p>Browse, watch, listen, download. No accounts required.</p>
            <span className="flow-tag">read-only</span>
          </div>
        </div>
      </section>

      <section className="section about-safety">
        <div className="section-head">
          <div>
            <span className="eyebrow">Safety rails</span>
            <h2 className="section-title">Built so that “no” is structural.</h2>
          </div>
          <p className="section-sub">
            Read-only is not a setting someone can flip off. It is the shape of the API.
          </p>
        </div>
        <div className="safety-grid">
          {SAFETY.map((item) => (
            <article className="safety-card" key={item.title}>
              <span className="safety-icon">{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section setup-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Set up your own</span>
            <h2 className="section-title">Three commands to a shore.</h2>
          </div>
          <p className="section-sub">
            Node 20 or newer. Run the node on the machine that owns the files; run the hub somewhere
            people can reach.
          </p>
        </div>

        <div className="setup-grid">
          <article className="setup-step">
            <span className="step-number">01</span>
            <h3>Install</h3>
            <p>Clone the repository and install the workspaces.</p>
            <CodeBlock label="Terminal">
              git clone https://github.com/Stellize/Data-Shore.git{'\n'}
              cd Data-Shore{'\n'}
              npm install
            </CodeBlock>
          </article>
          <article className="setup-step">
            <span className="step-number">02</span>
            <h3>Start a node</h3>
            <p>
              Point it at a folder. Keep the process running while the archive should be available.
            </p>
            <CodeBlock label="Machine holding your files">
              npm run node -- --root "/Volumes/Archive" --name "Home archive"
            </CodeBlock>
          </article>
          <article className="setup-step">
            <span className="step-number">03</span>
            <h3>Build and pair</h3>
            <p>
              Build the site, start the hub, and paste the pairing code from the node terminal into
              the console.
            </p>
            <CodeBlock label="Hub machine">
              npm run build{'\n'}
              DATA_SHORE_ADMIN_PASSWORD="choose-a-strong-one" npm start
            </CodeBlock>
          </article>
        </div>

        <div className="tunnel-note">
          <KeyRound size={18} />
          <div>
            <h3>Across the internet? Use a private tunnel.</h3>
            <p>
              Put the node behind Tailscale, Cloudflare Tunnel, or an authenticated reverse proxy,
              and give the hub the tunnel URL. Do not expose a raw node port to the public internet
              without TLS and a token you trust.
            </p>
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Questions</span>
            <h2 className="section-title">The small print, in plain words.</h2>
          </div>
        </div>
        <div className="faq-list">
          <details>
            <summary>Does the hub upload my files?</summary>
            <p>
              No. The hub stores a catalog of names, sizes, and dates, plus a token to reach the
              node. File bytes are pulled from the node only when a visitor opens or downloads one.
            </p>
          </details>
          <details>
            <summary>What happens if the node goes offline?</summary>
            <p>
              The catalog and browsing still work from the last sync, but previews, streams, and
              downloads fail until the node comes back. The console shows sync errors plainly.
            </p>
          </details>
          <details>
            <summary>Can visitors see files I add later?</summary>
            <p>
              Only after a sync. Open the archive in the console and press “Sync now” to rescan the
              folder and update the catalog. Removed files disappear from the catalog on the next
              sync.
            </p>
          </details>
          <details>
            <summary>Are video and audio streamed properly?</summary>
            <p>
              Yes. The node advertises byte ranges, the hub forwards range headers, and browsers can
              seek without downloading the whole file first.
            </p>
          </details>
          <details>
            <summary>How are unlisted archives different?</summary>
            <p>
              Unlisted archives are left out of the public list and search, but anyone with the
              direct link can still read them. Treat them as “quiet”, not private.
            </p>
          </details>
        </div>
      </section>

      <section className="cta-band">
        <div>
          <span className="eyebrow">Ready</span>
          <h2>Give a folder a shore.</h2>
          <p>Pair a node from the console and share the link with the people who should see it.</p>
        </div>
        <div className="cta-actions">
          <Link to="/console" className="btn btn-primary btn-lg">
            Open the console <ArrowRight size={17} />
          </Link>
          <Link to="/archives" className="btn btn-secondary btn-lg">
            Browse the archives
          </Link>
        </div>
      </section>
    </div>
  );
}
