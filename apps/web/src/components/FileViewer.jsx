import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Link2,
  LockKeyhole,
  ShieldCheck,
  X,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import Modal from './Modal.jsx';
import KindIcon, { kindLabel } from './KindIcon.jsx';
import { useToast } from './Toast.jsx';
import { api, archivePath, streamUrl } from '../api.js';
import { useFetch } from '../hooks.js';
import { fileFolder, formatBytes, formatDate } from '../utils.js';

const TEXT_KINDS = new Set(['text', 'code']);
const MAX_TEXT_BYTES = 2_000_000;
const MAX_CODE_LINES = 3000;
const MAX_TABLE_ROWS = 200;

function TextBody({ file, archive }) {
  const [state, setState] = useState({ status: 'loading', text: '', error: null });

  useEffect(() => {
    let active = true;
    if (!file || !TEXT_KINDS.has(file.kind)) return undefined;
    setState({ status: 'loading', text: '', error: null });
    fetch(streamUrl(archive.slug, file.path))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load this file (HTTP ${response.status}).`);
        return response.text();
      })
      .then((text) => {
        if (active) setState({ status: 'ready', text, error: null });
      })
      .catch((error) => {
        if (active) setState({ status: 'error', text: '', error: error.message });
      });
    return () => {
      active = false;
    };
  }, [file, archive.slug]);

  if (state.status === 'loading') {
    return <div className="viewer-loading">Loading text…</div>;
  }
  if (state.status === 'error') {
    return <div className="viewer-loading">{state.error}</div>;
  }

  const { text } = state;
  const ext = (file.ext || '').toLowerCase();

  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') {
    const html = DOMPurify.sanitize(marked.parse(text));
    return (
      <div className="viewer-document">
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }

  if (ext === 'csv' || ext === 'tsv') {
    const { rows, truncated } = parseTable(text, ext === 'tsv' ? '\t' : ',');
    return (
      <div className="viewer-document">
        <div className="table-wrap">
          <table className="csv-table">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) =>
                    rowIndex === 0 ? (
                      <th key={cellIndex}>{cell}</th>
                    ) : (
                      <td key={cellIndex}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {truncated ? <p className="viewer-note">Showing the first {MAX_TABLE_ROWS} rows.</p> : null}
      </div>
    );
  }

  if (ext === 'json' || ext === 'jsonl') {
    let pretty = text;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      pretty = text;
    }
    return <CodeBody text={pretty} />;
  }

  if (ext === 'html' || ext === 'htm' || ext === 'svg' || ext === 'xml') {
    return (
      <div className="viewer-document">
        <p className="viewer-note">
          <ShieldCheck size={13} /> Shown as plain text. The hub never renders active content.
        </p>
        <CodeBody text={text} />
      </div>
    );
  }

  return <CodeBody text={text} />;
}

function CodeBody({ text }) {
  const lines = useMemo(() => text.split(/\r?\n/), [text]);
  const visible = lines.slice(0, MAX_CODE_LINES);
  return (
    <div className="viewer-document viewer-code-wrap">
      <pre className="viewer-code">
        <code>
          {visible.map((line, index) => (
            <span className="code-line" key={index}>
              <span className="code-ln" aria-hidden="true">
                {index + 1}
              </span>
              <span className="code-text">{line || ' '}</span>
            </span>
          ))}
        </code>
      </pre>
      {lines.length > MAX_CODE_LINES ? (
        <p className="viewer-note">Showing the first {MAX_CODE_LINES} lines. Download for the full file.</p>
      ) : null}
    </div>
  );
}

function parseTable(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length > MAX_TABLE_ROWS) break;
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows, truncated: rows.length > MAX_TABLE_ROWS };
}

export default function FileViewer({
  open,
  archive,
  filePath,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onOpenFolder,
}) {
  const { push } = useToast();
  const { data, error, loading } = useFetch(
    open && filePath
      ? `${archivePath(archive.slug)}/file?path=${encodeURIComponent(filePath)}`
      : null,
  );
  const file = data?.file;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      const tag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag)) return;
      if (event.key === 'ArrowLeft' && hasPrev) onPrev?.();
      if (event.key === 'ArrowRight' && hasNext) onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hasPrev, hasNext, onPrev, onNext]);

  const copyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('file', filePath);
      await navigator.clipboard.writeText(url.toString());
      push('Link to this file copied.', { tone: 'success' });
    } catch {
      push('Could not copy the link.', { tone: 'error' });
    }
  };

  const textual = file && TEXT_KINDS.has(file.kind);
  const tooLargeToPreview = textual && file.size > MAX_TEXT_BYTES;
  const canPreview = file && !tooLargeToPreview;
  const downloadable = archive.downloads !== false;

  return (
    <Modal open={open} onClose={onClose} className="viewer" label={file?.name || 'File viewer'}>
      <header className="viewer-top">
        <div className="viewer-heading">
          <span className="viewer-kind">
            <KindIcon kind={file?.kind || 'other'} size={18} />
          </span>
          <div className="viewer-title">
            <h2>{file?.name || 'Loading…'}</h2>
            <p>{filePath}</p>
          </div>
        </div>
        <div className="viewer-actions">
          <div className="viewer-pager">
            <button
              type="button"
              className="icon-btn"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="Previous file"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next file"
            >
              <ChevronRight size={17} />
            </button>
          </div>
          {downloadable && file ? (
            <a
              className="btn btn-primary btn-sm"
              href={streamUrl(archive.slug, file.path, { download: true })}
            >
              <Download size={15} /> Download
            </a>
          ) : null}
          <button type="button" className="icon-btn viewer-close" onClick={onClose} aria-label="Close viewer">
            <X size={19} />
          </button>
        </div>
      </header>

      <div className={`viewer-body viewer-body-${file?.kind || 'loading'}`}>
        {loading ? (
          <div className="viewer-loading">Opening the file…</div>
        ) : error || !file ? (
          <div className="viewer-loading viewer-error">
            {error?.message || 'This file could no longer be found in the archive.'}
          </div>
        ) : tooLargeToPreview ? (
          <div className="viewer-fallback">
            <KindIcon kind={file.kind} size={34} />
            <h3>This text file is too large to preview.</h3>
            <p>{formatBytes(file.size)} — download it to read the whole thing.</p>
            {downloadable ? (
              <a className="btn btn-primary" href={streamUrl(archive.slug, file.path, { download: true })}>
                <Download size={16} /> Download file
              </a>
            ) : null}
          </div>
        ) : file.kind === 'image' ? (
          <figure className="viewer-figure">
            <img src={streamUrl(archive.slug, file.path)} alt={file.name} />
          </figure>
        ) : file.kind === 'video' ? (
          <div className="viewer-video-wrap">
            <video controls playsInline preload="metadata" src={streamUrl(archive.slug, file.path)}>
              Your browser cannot play this video.
            </video>
          </div>
        ) : file.kind === 'audio' ? (
          <div className="audio-card">
            <span className="audio-disc">
              <KindIcon kind="audio" size={30} />
            </span>
            <div className="audio-details">
              <h3>{file.name}</h3>
              <p>
                {kindLabel(file.kind, file.ext)} · {formatBytes(file.size)}
              </p>
              <audio controls autoPlay src={streamUrl(archive.slug, file.path)}>
                Your browser cannot play this audio.
              </audio>
            </div>
          </div>
        ) : file.kind === 'pdf' ? (
          <iframe
            className="viewer-pdf"
            title={file.name}
            src={`${streamUrl(archive.slug, file.path)}#toolbar=1&view=FitH`}
          />
        ) : canPreview && textual ? (
          <TextBody file={file} archive={archive} />
        ) : (
          <div className="viewer-fallback">
            <KindIcon kind={file.kind} size={34} />
            <h3>No preview for this format.</h3>
            <p>
              {kindLabel(file.kind, file.ext)} · {formatBytes(file.size)}. Download it to open it on
              your device.
            </p>
            {downloadable ? (
              <a className="btn btn-primary" href={streamUrl(archive.slug, file.path, { download: true })}>
                <Download size={16} /> Download file
              </a>
            ) : null}
          </div>
        )}
      </div>

      <footer className="viewer-foot">
        <div className="viewer-meta">
          {file ? (
            <>
              <span>{kindLabel(file.kind, file.ext)}</span>
              <span>{formatBytes(file.size)}</span>
              <span>Modified {formatDate(file.mtime)}</span>
            </>
          ) : null}
          <span className="viewer-readonly">
            <LockKeyhole size={12} /> Read-only
          </span>
        </div>
        <div className="viewer-foot-actions">
          <button type="button" className="text-btn" onClick={copyLink}>
            <Link2 size={14} /> Copy link
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => onOpenFolder?.(fileFolder(filePath))}
          >
            <FolderOpen size={14} /> Open folder
          </button>
        </div>
      </footer>
    </Modal>
  );
}
