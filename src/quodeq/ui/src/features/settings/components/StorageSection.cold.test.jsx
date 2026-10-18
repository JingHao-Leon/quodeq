import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { projectsKeys } from '../../../api/queryKeys.js';
import StorageSection from './StorageSection.jsx';

// The "keep the findings of archived runs for" row: a period is confirmed first, forever is not.
const GB = 1024 ** 3;
const IDLE = { state: 'idle', done: 0, total: 0, archived: 0, bytesFreed: 0 };
const SUMMARY = {
  bytes: 6.5 * GB, runs: 470, archived: 216, keepRuns: 10, coldAfterDays: null, archiveAfterDays: 183, autoCleanup: true,
  archiveNotice: null, clean: IDLE, projects: { p1: { bytes: 1, runs: 1, archived: 0 } },
};

function setup(overrides = {}) {
  const api = {
    getStorage: vi.fn(async () => SUMMARY),
    getCleanStatus: vi.fn(async () => ({ clean: IDLE })),
    putStorageSettings: vi.fn(async (body) => body),
    getCleanPreview: vi.fn(async () => ({ archive: 2, pack: 0, trim: 0, frees: GB })),
    startClean: vi.fn(async () => ({ clean: { ...IDLE, state: 'running', total: 10 } })),
    deleteAllEvaluations: vi.fn(async () => ({ deleted: 1 })),
    ...overrides,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(projectsKeys.list(), [{ id: 'p1', name: 'Alpha' }]);
  render(<QueryClientProvider client={qc}><ApiProvider value={api}><StorageSection /></ApiProvider></QueryClientProvider>);
  const section = () => within(document.querySelector('.storage-section'));
  return { api, section };
}

describe('StorageSection, keeping the findings of archived runs', () => {
  it('removing old findings asks first and saves only once confirmed', async () => {
    const { api, section } = setup();
    await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
    expect(section().getByRole('tab', { name: 'forever' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(section().getByRole('tab', { name: '6 months' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('The findings of runs archived more than 6 months ago are removed at the next clean up. Their grades and reports stay. This cannot be undone.')).toBeInTheDocument();
    expect(api.putStorageSettings).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: 'remove findings' }));
    await waitFor(() => expect(api.putStorageSettings).toHaveBeenCalledWith({ coldAfterDays: 183 }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelling the confirmation keeps the findings forever and sends nothing', async () => {
    const { api, section } = setup();
    await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
    fireEvent.click(section().getByRole('tab', { name: '1 year' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));
    expect(api.putStorageSettings).not.toHaveBeenCalled();
    expect(section().getByRole('tab', { name: 'forever' })).toHaveAttribute('aria-selected', 'true');
  });

  it('going back to forever needs no confirmation', async () => {
    const { api, section } = setup({ getStorage: vi.fn(async () => ({ ...SUMMARY, coldAfterDays: 91 })) });
    await waitFor(() => expect(section().getByRole('tab', { name: '3 months' })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(section().getByRole('tab', { name: 'forever' }));
    await waitFor(() => expect(api.putStorageSettings).toHaveBeenCalledWith({ coldAfterDays: null }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the clean modal says which findings it removes for good', async () => {
    const getStorage = vi.fn(async () => ({ ...SUMMARY, coldAfterDays: 183 }));
    const { section } = setup({ getStorage, getCleanPreview: vi.fn(async () => ({ archive: 2, pack: 0, trim: 12, frees: GB })) });
    await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
    fireEvent.click(section().getByRole('button', { name: 'clean now' }));
    const dialog = within(screen.getByRole('dialog'));
    await waitFor(() => expect(dialog.getByText(/^Archives 2 runs beyond the newest ones you keep, freeing about 1\.0 GB\. It also removes the findings of 12 runs archived more than 6 months ago\./)).toBeInTheDocument());
    expect(dialog.getByText(/The findings of those runs are deleted for good; their grades and reports stay\./)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'clean now' })).toBeEnabled();
  });

  it('the first-start notice names the findings it will remove and never says nothing is deleted', async () => {
    const getStorage = vi.fn()
      .mockResolvedValueOnce({ ...SUMMARY, coldAfterDays: 183, archiveNotice: { runs: 3, pack: 0, trim: 12, bytes: GB } })
      .mockResolvedValue({ ...SUMMARY, coldAfterDays: 183, archiveNotice: { runs: 0, pack: 0, trim: 12, bytes: GB } });
    const { section } = setup({ getStorage });
    await waitFor(() => expect(section().getByRole('status')).toHaveTextContent('it archives 3 runs beyond the 10 newest of each project, freeing about 1.0 GB.'));
    expect(section().getByRole('status')).toHaveTextContent('It also removes the findings of 12 runs archived more than 6 months ago, which cannot be brought back; their grades and reports stay.');
  });

  it('a trim-only notice says what goes and how to keep it', async () => {
    const getStorage = vi.fn(async () => ({ ...SUMMARY, coldAfterDays: 91, archiveNotice: { runs: 0, pack: 0, trim: 7, bytes: GB } }));
    const { section } = setup({ getStorage });
    await waitFor(() => expect(section().getByRole('status')).toHaveTextContent('Next time quodeq starts, it removes the findings of 7 runs archived more than 3 months ago, freeing about 1.0 GB. They cannot be brought back; grades and reports stay. To keep them, choose forever below or turn Clean up after start off.'));
    expect(section().getByRole('status')).not.toHaveTextContent('Nothing is deleted');
  });
});
