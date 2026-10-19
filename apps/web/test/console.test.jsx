import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';

const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockConsole(overrides = {}) {
  const state = { archive: fixture('console-archive.json') };
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    if (overrides[`${method} ${url}`]) return overrides[`${method} ${url}`]({ state, init });
    if (url === '/api/hub') return jsonResponse(fixture('hub.json'));
    if (url === '/api/console/session') return jsonResponse(fixture('console-session-auth.json'));
    if (url === '/api/console/overview') return jsonResponse(fixture('console-overview.json'));
    if (url === '/api/console/inspect') return jsonResponse(fixture('console-inspect.json'));
    if (url.startsWith('/api/console/archives/') && url.endsWith('/sync')) {
      return jsonResponse({ queued: true, sync: { phase: 'connecting' } }, 202);
    }
    if (url.startsWith('/api/console/archives/')) {
      if (method === 'PATCH') {
        state.archive.archive.title = JSON.parse(init.body).title;
        return jsonResponse(state.archive);
      }
      return jsonResponse(state.archive);
    }
    if (url === '/api/console/settings') return jsonResponse({ settings: fixture('console-overview.json').settings });
    return jsonResponse({ error: { code: 'NOT_FOUND', message: `Unmocked ${url}` } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(route) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockConsole();
  window.history.replaceState({}, '', '/');
});

describe('console', () => {
  it('renders the signed-in overview with managed archives', async () => {
    renderAt('/console');
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect((await screen.findAllByText('Managed archives')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tide Atlas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
    expect(screen.getByText('Files in catalogs')).toBeInTheDocument();
  });

  it('opens the pairing panel and connects to a node', async () => {
    renderAt('/console');
    await screen.findByRole('heading', { name: 'Overview' });
    fireEvent.click(await screen.findByRole('button', { name: /pair a node/i }));
    expect(await screen.findByLabelText('Pairing code')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pairing code'), {
      target: { value: 'eyJ2IjoxLCJraW5kIjoiZGF0YS1zaG9yZS1ub2RlIn0' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check node/i }));
    expect(await screen.findByText('Node connected')).toBeInTheDocument();
    expect(await screen.findByText('Choose a share')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Tide Atlas/ })).toBeInTheDocument();
  });

  it('renders archive management with sync and danger controls', async () => {
    renderAt('/console/archives/15fee3b3df291959');
    expect(
      await screen.findByRole('heading', { name: 'Tide Atlas', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /sync now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete archive/i })).toBeInTheDocument();
    expect(screen.getByText('Public doorway')).toBeInTheDocument();
    expect(screen.getByText(/token held server-side/i)).toBeInTheDocument();
  });

  it('confirms deletion before removing an archive', async () => {
    const fetchMock = mockConsole({
      'DELETE /api/console/archives/15fee3b3df291959': () =>
        jsonResponse({ deleted: true, id: '15fee3b3df291959' }),
    });
    renderAt('/console/archives/15fee3b3df291959');
    await screen.findByRole('heading', { name: 'Tide Atlas', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /delete archive/i }));
    expect(await screen.findByRole('heading', { name: /Delete “Tide Atlas”\?/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Delete “Tide Atlas”\?/ })).not.toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.some(([url, init]) => init?.method === 'DELETE'),
    ).toBe(false);
  });

  it('saves archive details through the API', async () => {
    const fetchMock = mockConsole();
    renderAt('/console/archives/15fee3b3df291959');
    const titleInput = await screen.findByDisplayValue('Tide Atlas');
    fireEvent.change(titleInput, { target: { value: 'Tide Atlas · revised' } });
    fireEvent.click(screen.getByRole('button', { name: /save details/i }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => init?.method === 'PATCH' && JSON.parse(init.body).title === 'Tide Atlas · revised',
        ),
      ).toBe(true);
    });
  });

  it('renders hub settings', async () => {
    renderAt('/console/settings');
    expect(await screen.findByDisplayValue('Data Shore')).toBeInTheDocument();
    expect(await screen.findByText('What cannot be changed')).toBeInTheDocument();
    expect(screen.getByText('Console security')).toBeInTheDocument();
  });
});
