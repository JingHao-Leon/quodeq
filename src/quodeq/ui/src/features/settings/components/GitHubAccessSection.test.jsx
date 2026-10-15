import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import GitHubAccessSection from './GitHubAccessSection.jsx';

function renderSection(api) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><ApiProvider value={api}><GitHubAccessSection /></ApiProvider></QueryClientProvider>);
}

const base = { signOutGithub: vi.fn(), startDeviceFlow: vi.fn(), getDeviceFlow: vi.fn() };

describe('GitHubAccessSection', () => {
  it('shows not signed in and a sign-in button', async () => {
    renderSection({ ...base, getGithubAccount: vi.fn(async () => ({ signedIn: false, login: null, method: 'none', expiresAt: null, ghAvailable: false, ghLoggedIn: false, signInAvailable: true })) });
    await waitFor(() => expect(screen.getByText(/not signed in/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('without a client id hides sign-in and says so', async () => {
    renderSection({ ...base, getGithubAccount: vi.fn(async () => ({ signedIn: false, login: null, method: 'none', expiresAt: null, ghAvailable: false, ghLoggedIn: false, signInAvailable: false })) });
    await waitFor(() => expect(screen.getByText(/sign-in is not set up in this build/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /sign in with github/i })).not.toBeInTheDocument();
  });

  it('shows the gh login state', async () => {
    renderSection({ ...base, getGithubAccount: vi.fn(async () => ({ signedIn: false, login: null, method: 'gh', expiresAt: null, ghAvailable: true, ghLoggedIn: true, signInAvailable: true })) });
    await waitFor(() => expect(screen.getByText(/using your gh login/i)).toBeInTheDocument());
  });

  it('signed in shows the login and sign-out with a confirm step', async () => {
    const signOutGithub = vi.fn(async () => {});
    const getGithubAccount = vi.fn(async () => ({ signedIn: true, login: 'victor', method: 'quodeq', expiresAt: null, ghAvailable: false, ghLoggedIn: false, signInAvailable: true }));
    renderSection({ ...base, signOutGithub, getGithubAccount });
    await waitFor(() => expect(screen.getByText(/signed in as victor via quodeq/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^sign out$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }));
    await waitFor(() => expect(signOutGithub).toHaveBeenCalled());
    expect(getGithubAccount.mock.calls.length).toBeGreaterThan(1);
  });

  it('expired token says so', async () => {
    renderSection({ ...base, getGithubAccount: vi.fn(async () => ({ signedIn: true, login: 'victor', method: 'quodeq', expiresAt: 1, ghAvailable: false, ghLoggedIn: false, signInAvailable: true })) });
    await waitFor(() => expect(screen.getByText(/token expired/i)).toBeInTheDocument());
  });

  it('has no Test access row (the add flow already probes access)', async () => {
    renderSection({ ...base, getGithubAccount: vi.fn(async () => ({ signedIn: false, login: null, method: 'gh', expiresAt: null, ghAvailable: true, ghLoggedIn: true, signInAvailable: true })) });
    await waitFor(() => expect(screen.getByText(/using your gh login/i)).toBeInTheDocument());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/test access/i)).not.toBeInTheDocument();
  });
});
