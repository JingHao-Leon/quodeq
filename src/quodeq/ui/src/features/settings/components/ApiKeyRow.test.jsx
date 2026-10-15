import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import ApiKeyRow from './ApiKeyRow.jsx';

function renderRow({ configured, update = vi.fn() }) {
  const getProviderKeyStatus = vi.fn(async () => ({ configured }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ApiProvider value={{ getProviderKeyStatus }}>
        <ApiKeyRow providerId="openrouter" update={update} description="desc" />
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { update };
}

describe('ApiKeyRow', () => {
  it('with no key shows a password field and saves through update', async () => {
    const { update } = renderRow({ configured: false });
    const input = await screen.findByLabelText(/api key/i, { selector: 'input' });
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.change(input, { target: { value: 'sk-123' } });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));
    expect(update).toHaveBeenCalledWith('api-key', 'sk-123');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('after the save lands, re-reads the status and shows key saved', async () => {
    let configured = false;
    const getProviderKeyStatus = vi.fn(async () => ({ configured }));
    // The keychain write lands after the click, like the real POST.
    const update = vi.fn(() => new Promise((resolve) => { setTimeout(() => { configured = true; resolve(); }, 30); }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ApiProvider value={{ getProviderKeyStatus }}>
          <ApiKeyRow providerId="openrouter" update={update} description="desc" />
        </ApiProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(await screen.findByLabelText(/api key/i, { selector: 'input' }), { target: { value: 'sk-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));
    await waitFor(() => expect(screen.getByText(/key saved/i)).toBeInTheDocument());
  });

  it('with a stored key says so and never shows it', async () => {
    renderRow({ configured: true });
    await waitFor(() => expect(screen.getByText(/key saved/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/api key/i, { selector: 'input' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /replace/i }));
    expect(screen.getByLabelText(/api key/i, { selector: 'input' })).toHaveValue('');
  });

  it('keeps the typed key and the field when the keychain refuses it', async () => {
    const update = vi.fn(async () => false);
    renderRow({ configured: false, update });
    const input = await screen.findByLabelText(/api key/i, { selector: 'input' });
    fireEvent.change(input, { target: { value: 'sk-123' } });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(screen.getByLabelText(/api key/i, { selector: 'input' })).toHaveValue('sk-123');
    expect(screen.queryByText(/key saved/i)).not.toBeInTheDocument();
  });

  it('replace can be backed out of without saving', async () => {
    renderRow({ configured: true });
    fireEvent.click(await screen.findByRole('button', { name: /replace/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByText(/key saved/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i, { selector: 'input' })).not.toBeInTheDocument();
  });

  it('shows checking, not an empty field, while the key status loads', () => {
    renderRow({ configured: true });
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i, { selector: 'input' })).not.toBeInTheDocument();
  });

  it('asks the browser not to offer a saved password', async () => {
    renderRow({ configured: false });
    expect(await screen.findByLabelText(/api key/i, { selector: 'input' })).toHaveAttribute('autocomplete', 'new-password');
  });
});
