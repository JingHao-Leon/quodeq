import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { projectKeys, projectsKeys } from '../../../api/queryKeys.js';
import StorageSection from './StorageSection.jsx';

const GB = 1024 ** 3;
// The first progress poll comes one interval (1 s) after the clean starts.
const POLL_WAIT = { timeout: 2500 };
const IDLE = { state: 'idle', done: 0, total: 0, archived: 0, bytesFreed: 0 };
const SUMMARY = {
  bytes: 6.5 * GB, runs: 470, archived: 216, archiveAfterDays: 183, clean: IDLE,
  projects: { p1: { bytes: 1, runs: 1, archived: 0 }, p2: { bytes: 1, runs: 1, archived: 0 } },
};

function busy(message, projects = [], code = 'STORAGE_BUSY') {
  return Object.assign(new Error(message), { status: 409, code, body: { error: message, code, projects } });
}

function setup(overrides = {}, props = {}) {
  const api = {
    getStorage: vi.fn(async () => SUMMARY),
    getCleanStatus: vi.fn(async () => ({ clean: IDLE })),
    putStorageSettings: vi.fn(async (body) => body),
    getCleanPreview: vi.fn(async () => ({ archive: 212, frees: 3 * GB })),
    startClean: vi.fn(async () => ({ clean: { ...IDLE, state: 'running', total: 10 } })),
    deleteAllEvaluations: vi.fn(async () => ({ deleted: 2 })),
    ...overrides,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(projectsKeys.list(), [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]);
  render(<QueryClientProvider client={qc}><ApiProvider value={api}><StorageSection {...props} /></ApiProvider></QueryClientProvider>);
  const section = () => within(document.querySelector('.storage-section'));
  return { api, qc, section };
}

async function openClean(section) {
  await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
  fireEvent.click(section().getByRole('button', { name: 'clean now' }));
  const dialog = within(screen.getByRole('dialog'));
  await waitFor(() => expect(dialog.getByText(/^Archives 212 runs/)).toBeInTheDocument());
  return dialog;
}

async function openDeleteAll(section) {
  await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
  fireEvent.click(section().getByRole('button', { name: /more storage actions/i }));
  fireEvent.click(section().getByRole('menuitem', { name: /delete all evaluation data/i }));
  return within(screen.getByRole('dialog'));
}

describe('StorageSection', () => {
  it('shows the size and archived runs from the summary', async () => {
    const { section } = setup();
    await waitFor(() => expect(section().getByText('6.5 GB of evaluations on this machine · 216 of 470 runs archived')).toBeInTheDocument());
    expect(section().getByRole('tab', { name: '6 months' })).toHaveAttribute('aria-selected', 'true');
  });

  it('says it could not read storage and keeps the controls', async () => {
    const { section } = setup({ getStorage: vi.fn(async () => { throw new Error('boom'); }) });
    await waitFor(() => expect(section().getByText("Couldn't read storage.")).toBeInTheDocument());
    expect(section().getByRole('button', { name: 'clean now' })).toBeInTheDocument();
    expect(section().getAllByRole('tab')).toHaveLength(4);
  });

  it('saves the archive-after choice in days', async () => {
    const { api, section } = setup();
    await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
    fireEvent.click(section().getByRole('tab', { name: '1 year' }));
    await waitFor(() => expect(api.putStorageSettings).toHaveBeenCalledWith({ archiveAfterDays: 365 }));
    expect(section().getByRole('tab', { name: '1 year' })).toHaveAttribute('aria-selected', 'true');
  });

  it('puts the choice back when saving fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { section } = setup({ putStorageSettings: vi.fn(async () => { throw new Error('nope'); }) });
    await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
    fireEvent.click(section().getByRole('tab', { name: 'never' }));
    await waitFor(() => expect(section().getByRole('tab', { name: '6 months' })).toHaveAttribute('aria-selected', 'true'));
    warn.mockRestore();
  });

  it('says under the row that the choice was not saved, until a save works', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const putStorageSettings = vi.fn(async () => { throw new Error('nope'); });
    const { section } = setup({ putStorageSettings });
    await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
    fireEvent.click(section().getByRole('tab', { name: 'never' }));
    await waitFor(() => expect(section().getByText("Couldn't save. Try again.")).toBeInTheDocument());
    putStorageSettings.mockImplementation(async (body) => body);
    fireEvent.click(section().getByRole('tab', { name: '1 year' }));
    await waitFor(() => expect(section().queryByText("Couldn't save. Try again.")).not.toBeInTheDocument());
    warn.mockRestore();
  });

  it('previews the clean, then runs it and shows the progress', async () => {
    let finish = () => {};
    const getCleanStatus = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { api, section } = setup({ getCleanStatus });
    await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
    fireEvent.click(section().getByRole('button', { name: 'clean now' }));
    const dialog = within(screen.getByRole('dialog'));
    await waitFor(() => expect(dialog.getByText('Archives 212 runs untouched for longer than you chose, freeing about 3.0 GB.')).toBeInTheDocument());
    fireEvent.click(dialog.getByRole('button', { name: 'clean now' }));
    await waitFor(() => expect(section().getByText('Cleaning… 0 of 10 runs')).toBeInTheDocument());
    expect(api.startClean).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getCleanStatus).toHaveBeenCalled(), POLL_WAIT);
    finish({ clean: { state: 'done', done: 10, total: 10, archived: 8, bytesFreed: 2 * GB } });
    await waitFor(() => expect(api.getStorage).toHaveBeenCalledTimes(2));
  });

  it('says what a pass freed once it is done', async () => {
    const done = { state: 'done', done: 10, total: 10, archived: 8, bytesFreed: 2 * GB };
    const getStorage = vi.fn().mockResolvedValueOnce(SUMMARY).mockResolvedValue({ ...SUMMARY, clean: done });
    const { section } = setup({ getStorage, getCleanStatus: vi.fn(async () => ({ clean: done })) });
    fireEvent.click((await openClean(section)).getByRole('button', { name: 'clean now' }));
    await waitFor(() => expect(section().getByText(/Freed 2\.0 GB\./)).toBeInTheDocument(), POLL_WAIT);
  });

  it('says when the pass it watched did not finish', async () => {
    const failed = { state: 'failed', done: 3, total: 10, archived: 2, bytesFreed: 0 };
    const getStorage = vi.fn().mockResolvedValueOnce(SUMMARY).mockResolvedValue({ ...SUMMARY, clean: failed });
    const { section } = setup({ getStorage, getCleanStatus: vi.fn(async () => ({ clean: failed })) });
    fireEvent.click((await openClean(section)).getByRole('button', { name: 'clean now' }));
    await waitFor(() => expect(section().getByText(/The last clean didn't finish\./)).toBeInTheDocument(), POLL_WAIT);
  });

  it('reads quietly while loading and never announces an earlier pass', async () => {
    let answer = () => {};
    const leftover = { ...SUMMARY, clean: { state: 'done', done: 4, total: 4, archived: 4, bytesFreed: GB } };
    const { section } = setup({ getStorage: vi.fn(() => new Promise((resolve) => { answer = resolve; })) });
    expect(section().getByText('Reading storage…')).toBeInTheDocument();
    answer(leftover);
    await waitFor(() => expect(section().getByText(/^6\.5 GB of evaluations/)).toBeInTheDocument());
    expect(section().queryByText(/Freed/)).not.toBeInTheDocument();
  });

  it('with nothing to archive says so and cannot clean', async () => {
    const { section } = setup({ getCleanPreview: vi.fn(async () => ({ archive: 0, frees: 0 })) });
    await waitFor(() => expect(section().getByText(/6\.5 GB/)).toBeInTheDocument());
    fireEvent.click(section().getByRole('button', { name: 'clean now' }));
    const dialog = within(screen.getByRole('dialog'));
    await waitFor(() => expect(dialog.getByText('Nothing to archive right now.')).toBeInTheDocument());
    expect(dialog.getByRole('button', { name: 'clean now' })).toBeDisabled();
  });

  it('shows a busy clean inline in the modal', async () => {
    const startClean = vi.fn(async () => { throw busy('busy', [], 'STORAGE_WARMUP'); });
    const { section } = setup({ startClean });
    const dialog = await openClean(section);
    fireEvent.click(dialog.getByRole('button', { name: 'clean now' }));
    await waitFor(() => expect(dialog.getByText('The scores are still loading. Try again in a moment.')).toBeInTheDocument());
  });

  it('deletes all only once the phrase is typed, in any case', async () => {
    const onEvaluationsDeleted = vi.fn();
    const { api, qc, section } = setup({}, { onEvaluationsDeleted });
    qc.setQueryData(projectKeys.scores('p1'), { stale: true });
    qc.setQueryData(projectKeys.scores('p1', null, 'shared'), { kept: true });
    const dialog = await openDeleteAll(section);
    expect(dialog.getByText('470 runs across 2 projects, 6.5 GB')).toBeInTheDocument();
    const confirm = dialog.getByRole('button', { name: 'delete' });
    expect(confirm).toBeDisabled();
    fireEvent.change(dialog.getByLabelText('confirmation'), { target: { value: 'Delete All' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(onEvaluationsDeleted).toHaveBeenCalled());
    expect(api.deleteAllEvaluations).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(qc.getQueryData(projectKeys.scores('p1'))).toBeUndefined();
    expect(qc.getQueryData(projectKeys.scores('p1', null, 'shared'))).toEqual({ kept: true });
  });

  it('names the projects whose evaluation blocks delete all', async () => {
    const deleteAllEvaluations = vi.fn(async () => { throw busy('An evaluation or a storage clean is running', ['p2']); });
    const onEvaluationsDeleted = vi.fn();
    const { section } = setup({ deleteAllEvaluations }, { onEvaluationsDeleted });
    const dialog = await openDeleteAll(section);
    fireEvent.change(dialog.getByLabelText('confirmation'), { target: { value: 'delete all' } });
    fireEvent.click(dialog.getByRole('button', { name: 'delete' }));
    await waitFor(() => expect(dialog.getByText('An evaluation is running in Beta. Wait for it to finish.')).toBeInTheDocument());
    expect(onEvaluationsDeleted).not.toHaveBeenCalled();
  });
});
