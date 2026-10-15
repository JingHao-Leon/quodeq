import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
const api = new Proxy(OVERRIDES, { get: (target, name) => target[name] ?? (async () => ({})) });

// The app mounts the real log provider higher up; the page only needs its shape.
const serverLog = { open: false, openLog: () => {}, closeLog: () => {} };

const theme = { mode: 'system', family: 'daruma', onApplyMode: () => {}, onApplyFamily: () => {} };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApiProvider value={api}>
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

  it('puts diagnostics and the welcome under App', async () => {
    renderPage();
    const app = (await screen.findByRole('heading', { level: 2, name: 'App' })).closest('section');
    expect(within(app).getByText(/show the welcome again/i)).toBeInTheDocument();
    expect(within(app).getByText(/diagnostics/i)).toBeInTheDocument();
  });

  it('shows the version once', async () => {
    renderPage();
    await screen.findByText('v1.13.1');
    expect(screen.queryAllByText(/1\.13\.1/)).toHaveLength(1);
  });
});
