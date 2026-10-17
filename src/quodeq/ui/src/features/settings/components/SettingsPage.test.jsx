import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { ServerLogContext } from '../server-log/ServerLogContext.js';
import { SidePaneProvider } from '../../side-pane/SidePaneProvider.jsx';
import SettingsPage from './SettingsPage.jsx';

// Every API call the page's sections make resolves; these few carry data.
const OVERRIDES = {
  getAiClients: async () => ({ clients: [{ id: 'claude', label: 'Claude', type: 'cli', installed: true }] }),
  getGithubAccount: async () => ({ signedIn: false, method: 'gh', signInAvailable: false }),
  getUpdateStatus: async () => ({ current: '1.13.1', update_available: false, auto_check_enabled: true }),
  getSharedStatus: async () => ({ configured: false, url: null }),
  getMenubar: async () => ({ supported: false }),
};
const proxyOf = (overrides) => new Proxy(overrides, { get: (target, name) => target[name] ?? (async () => ({})) });
const api = proxyOf(OVERRIDES);

// The app mounts the real log provider higher up; the page only needs its shape.
const serverLog = { open: false, openLog: () => {}, closeLog: () => {} };

const theme = { mode: 'system', family: 'daruma', onApplyMode: () => {}, onApplyFamily: () => {} };

function renderPage(pageApi = api) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApiProvider value={pageApi}>
        <SidePaneProvider>
          <ServerLogContext.Provider value={serverLog}>
            <SettingsPage theme={theme} onOpenGradeFormula={() => {}} onSharedDisconnected={() => {}} onShowWelcome={() => {}} />
          </ServerLogContext.Provider>
        </SidePaneProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => { localStorage.clear(); });

  it('renders the five groups in order, with no Verify or Test access', async () => {
    renderPage();
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Model', 'Evaluation', 'Connections', 'App', 'About']);
    expect(screen.queryByText(/verify findings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/test access/i)).not.toBeInTheDocument();
  });

  it('puts the local server and the welcome under App, the server shown open', async () => {
    renderPage();
    const app = (await screen.findByRole('heading', { level: 2, name: 'App' })).closest('section');
    expect(within(app).getByText(/show the welcome again/i)).toBeInTheDocument();
    expect(within(app).getByText('Local server')).toBeInTheDocument();
    expect(app.querySelector('details')).toBeNull();
  });

  it('shows the version once', async () => {
    renderPage();
    await screen.findByText('v1.13.1');
    expect(screen.queryAllByText(/1\.13\.1/)).toHaveLength(1);
  });

  it('the About line follows a manual check that finds an update', async () => {
    renderPage(proxyOf({
      ...OVERRIDES,
      checkForUpdates: async () => ({ current: '1.13.1', latest: '1.14.0', update_available: true, auto_check_enabled: true }),
    }));
    await screen.findByText('v1.13.1');
    fireEvent.click(screen.getByRole('button', { name: /check now/i }));
    expect(await screen.findByText('v1.13.1 · 1.14.0 available')).toBeInTheDocument();
  });

  it('says so when the update status cannot be read, instead of checking forever', async () => {
    renderPage(proxyOf({ ...OVERRIDES, getUpdateStatus: async () => { throw new Error('offline'); } }));
    expect(await screen.findByText('update check unavailable')).toBeInTheDocument();
  });

  it('keeps the welcome and the local server on their own line when there is no desktop section', async () => {
    renderPage();
    const welcome = await screen.findByText(/show the welcome again/i);
    const line = welcome.closest('.settings-group__line');
    expect(line).not.toBeNull();
    expect(within(line).getByText('Local server')).toBeInTheDocument();
    expect(within(line).queryByText('Toolbar')).toBeNull();
  });
});
