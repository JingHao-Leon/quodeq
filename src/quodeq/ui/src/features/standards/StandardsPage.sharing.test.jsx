import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../api/ApiContext.jsx';
import StandardsPage from './StandardsPage.jsx';
import { t } from '../../strings/index.js';

const state = vi.hoisted(() => ({ connection: { configured: false, host: null }, sync: {} }));

vi.mock('../../api/index.js', () => ({ exportStandard: vi.fn() }));
vi.mock('../../hooks/useAppState.js', () => ({ useAppState: () => ({ selectedProject: 'p' }) }));
vi.mock('./hooks/useVisibleStandards.js', () => ({
  useVisibleStandards: () => ({ isVisible: () => true, toggle: vi.fn(), add: vi.fn(), remove: vi.fn() }),
}));
vi.mock('./hooks/useStandardsOverrides.js', () => ({ useStandardsOverrides: () => ({ counts: {} }) }));
vi.mock('./hooks/useStandards.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useStandards: () => ({
    grouped: { custom: [
      { id: 'mine', name: 'Mine', type: 'custom', principleCount: 1, requirementCount: 1, syncState: 'never_shared' },
      { id: 'go', name: 'Go Services', type: 'custom', principleCount: 1, requirementCount: 1, syncState: 'remote_only', remote: true },
    ] },
    loading: false, error: null, refresh: vi.fn(), handleDelete: vi.fn(), handleDuplicate: vi.fn(),
  }),
}));
vi.mock('../dashboard/hooks/useSharedProjects.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useSharedConnection: () => state.connection,
}));
vi.mock('../../hooks/useSyncStatus.js', () => ({ useSyncStatus: () => state.sync }));

function renderPage(api) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ApiProvider value={api}><StandardsPage /></ApiProvider></QueryClientProvider>);
}

const remoteFact = `· ${t('standards.remoteCount', { count: 1 })}`;

describe('StandardsPage sharing', () => {
  beforeEach(() => {
    state.sync = { lastSynced: Date.now(), refresh: { state: 'idle', phase: null }, refetch: vi.fn(async () => {}) };
  });

  it('connected: band, sync column, remote row and the remote fact', () => {
    state.connection = { configured: true, host: 'github.com/quodeq/evaluations' };
    renderPage({ startRefresh: vi.fn() });
    expect(screen.getByText('github.com/quodeq/evaluations')).toBeInTheDocument();
    expect(screen.getByText(t('standards.colSync'))).toBeInTheDocument();
    expect(screen.getByText('Go Services')).toBeInTheDocument();
    expect(screen.getByText(remoteFact, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(t('standards.activeCount', { count: 1 }), { exact: false })).toBeInTheDocument();
  });

  it('not connected: no band, no sync column, no remote row, no remote fact', () => {
    state.connection = { configured: false, host: null };
    renderPage({ startRefresh: vi.fn() });
    expect(screen.queryByText(t('standards.bandRepository'))).toBeNull();
    expect(screen.queryByText(t('standards.colSync'))).toBeNull();
    expect(screen.queryByText('Go Services')).toBeNull();
    expect(screen.queryByText(remoteFact, { exact: false })).toBeNull();
  });

  it('pull starts one refresh and re-reads the status', async () => {
    state.connection = { configured: true, host: 'h' };
    const startRefresh = vi.fn(async () => ({ started: true }));
    renderPage({ startRefresh });
    fireEvent.click(screen.getByRole('button', { name: t('standards.bandPull') }));
    await waitFor(() => expect(state.sync.refetch).toHaveBeenCalled());
    expect(startRefresh).toHaveBeenCalledTimes(1);
  });

  it('the pull button reads pulling while the refresh job runs', () => {
    state.connection = { configured: true, host: 'h' };
    state.sync.refresh = { state: 'running', phase: 'downloading' };
    renderPage({ startRefresh: vi.fn() });
    expect(screen.getByRole('button', { name: t('standards.bandPulling') })).toHaveAttribute('aria-disabled', 'true');
  });

  it('a pull that cannot start shows an inline error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.connection = { configured: true, host: 'h' };
    renderPage({ startRefresh: vi.fn(async () => { throw new Error('offline'); }) });
    fireEvent.click(screen.getByRole('button', { name: t('standards.bandPull') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('standards.bandPullFailed'));
  });

  it('two fast clicks start one refresh, and the button reads pulling meanwhile', async () => {
    state.connection = { configured: true, host: 'h' };
    let release;
    const startRefresh = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    renderPage({ startRefresh });
    const btn = screen.getByRole('button', { name: t('standards.bandPull') });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(startRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: t('standards.bandPulling') })).toBeInTheDocument();
    release({ started: true });
    expect(await screen.findByRole('button', { name: t('standards.bandPull') })).toBeInTheDocument();
  });
});
