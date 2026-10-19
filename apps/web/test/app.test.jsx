import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';

const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

const ROUTES = {
  '/api/hub': 'hub.json',
  '/api/archives': 'archives.json',
  '/api/archives/tide-atlas': 'archive-tide-atlas.json',
  '/api/archives/tide-atlas/browse?path=field-notes': 'browse-field-notes.json',
  '/api/archives/tide-atlas/search?q=tide': 'search-tide-atlas.json',
  '/api/archives/tide-atlas/file?path=essays/waves-at-the-edge.md': 'file-essay.json',
  '/api/search?q=tide': 'global-search.json',
  '/api/console/session': 'console-session.json',
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi(overrides = {}) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push({ url, init });
      if (overrides[url]) return overrides[url]();
      if (ROUTES[url]) return jsonResponse(fixture(ROUTES[url]));
      if (url.startsWith('/api/archives/tide-atlas/browse')) {
        return jsonResponse(fixture('archive-tide-atlas.json').highlights ? fixture('browse-field-notes.json') : {});
      }
      if (url.startsWith('/api/archives/tide-atlas/file?path=')) {
        return jsonResponse(fixture('file-essay.json'));
      }
      if (url.startsWith('/api/archives/tide-atlas/stream')) {
        return new Response(
          '# Waves at the Edge\n\nThe table is a promise.\n\n> The sea does not read the table.',
          { status: 200, headers: { 'Content-Type': 'text/plain' } },
        );
      }
      if (url.startsWith('/api/archives/tide-atlas')) return jsonResponse(fixture('archive-tide-atlas.json'));
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
    }),
  );
  return calls;
}

function renderAt(route) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockApi();
});

describe('public site', () => {
  it('renders the home page with featured archive and metrics', async () => {
    renderAt('/');
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'H1' && element.textContent.includes('Your folders, open to read'),
      ),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('Tide Atlas')).not.toHaveLength(0);
    await waitFor(() => expect(screen.getByText('Files cataloged')).toBeInTheDocument());
    expect(screen.getByText('Read-only by design')).toBeInTheDocument();
  });

  it('lists both seeded archives', async () => {
    renderAt('/archives');
    expect(await screen.findByRole('heading', { name: 'All archives' })).toBeInTheDocument();
    expect(await screen.findByText('Tide Atlas')).toBeInTheDocument();
    expect(await screen.findByText('Harbor Sessions')).toBeInTheDocument();
    expect(screen.getByText('2 archives')).toBeInTheDocument();
  });

  it('renders an archive with folders, files, and facts', async () => {
    renderAt('/archives/tide-atlas');
    expect(await screen.findByRole('heading', { name: 'Tide Atlas', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('photographs')).toBeInTheDocument();
    expect(screen.getAllByText('Folders').length).toBeGreaterThan(0);
    expect(screen.getByText('essays')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search this archive/i })).toBeInTheDocument();
  });

  it('opens the markdown viewer with sanitized content and a download action', async () => {
    renderAt('/archives/tide-atlas?file=essays/waves-at-the-edge.md');
    expect(await screen.findByRole('heading', { name: 'waves-at-the-edge.md' })).toBeInTheDocument();
    expect(await screen.findByText(/The table is a promise/i)).toBeInTheDocument();
    const download = screen.getByRole('link', { name: /download/i });
    expect(download.getAttribute('href')).toContain('download=1');
    expect(screen.getAllByText(/Read-only/i).length).toBeGreaterThan(0);
  });

  it('filters files by kind', async () => {
    renderAt('/archives/tide-atlas');
    await screen.findByRole('heading', { name: 'Tide Atlas', level: 1 });
    const imagesChip = await screen.findByRole('button', { name: 'Images' });
    fireEvent.click(imagesChip);
    await waitFor(() => {
      expect(screen.getByText(/No files of that kind here/i)).toBeInTheDocument();
    });
  });

  it('searches inside an archive from the URL', async () => {
    renderAt('/archives/tide-atlas?q=tide');
    expect(await screen.findByText(/matches for/i)).toBeInTheDocument();
    expect(screen.getAllByText(/tide/i).length).toBeGreaterThan(0);
  });

  it('renders global search results with their archive', async () => {
    renderAt('/search?q=tide');
    expect(await screen.findByText(/matches for/i)).toBeInTheDocument();
    expect(await screen.findAllByText('Tide Atlas')).not.toHaveLength(0);
  });

  it('renders the how-it-works page', async () => {
    renderAt('/about');
    expect(await screen.findByRole('heading', { name: 'A reader, never an editor.' })).toBeInTheDocument();
    expect(screen.getByText('GET-only API')).toBeInTheDocument();
  });

  it('renders the console login when signed out', async () => {
    renderAt('/console');
    expect(await screen.findByRole('heading', { name: /Sign in to the console\./ })).toBeInTheDocument();
    expect(screen.getByLabelText(/console password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders a not-found page for unknown routes', async () => {
    renderAt('/nowhere');
    expect(await screen.findByRole('heading', { name: 'This path has no shore.' })).toBeInTheDocument();
  });
});
