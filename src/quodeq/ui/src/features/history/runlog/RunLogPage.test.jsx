import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import RunLogPage from './RunLogPage.jsx';

const base = {
  status: 'done', model: 'qwen', origin: { kind: 'app' }, dims: ['security'], partial: false, grade: 'Good', open: 10, critical: 0, majors: 2,
  dimensionDetails: [{ dimension: 'security', score: 8.4, grade: 'Good', majors: 2, critical: 0 }], pending: false,
};
const RUNS = [
  { ...base, runId: 'a', jobId: 'ext-a', startedAt: '2026-10-11T00:45:04+00:00', score: 8.5, baselineRunId: 'b', baselineKind: 'same-model', counts: { new: 0, resolved: 1 } },
  { ...base, runId: 'b', jobId: 'ext-b', startedAt: '2026-10-10T01:36:00+00:00', score: 8.3, model: 'gpt', baselineRunId: null, counts: null },
];
const DIFF = { dimensions: { security: { counts: { new: 0, resolved: 1 }, new: [], resolved: [{ severity: 'minor', title: 'Old', principle: 'P', file: 'b.py', line: 1 }] } } };

function renderPage(props = {}, runs = RUNS) {
  const api = { getRunLog: vi.fn(async () => ({ runs, running: null })), getRunDiff: vi.fn(async () => DIFF), getEvaluationProgress: vi.fn(async () => ({ dimensions: [] })) };
  const cb = { onRunClick: vi.fn(), onDimensionClick: vi.fn(), onNavigate: vi.fn(), onRunChange: vi.fn(), ...props };
  const Wrapper = withStableQueryApi(api);
  render(<Wrapper><RunLogPage project="p1" {...cb} /></Wrapper>);
  return { ...cb, api };
}

describe('RunLogPage', () => {
  // Filters are kept per project for the session; each test starts clean.
  beforeEach(() => sessionStorage.clear());

  it('down selects the next run, Enter on the page opens it, keys in a field are ignored', async () => {
    const cb = renderPage();
    await screen.findByText(/comparison|vs /);
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await waitFor(() => expect(cb.onRunChange).toHaveBeenLastCalledWith('b'));
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(cb.onRunClick).toHaveBeenCalledWith('b', expect.any(String), { archived: false });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(cb.onRunChange).toHaveBeenLastCalledWith('b');
    input.remove();
  });

  it('reads the selected run\'s throughput without counting findings, so an archived run stays packed', async () => {
    const { api } = renderPage();
    await screen.findByText(/comparison|vs /);
    await waitFor(() => expect(api.getEvaluationProgress).toHaveBeenCalled());
    expect(api.getEvaluationProgress).toHaveBeenCalledWith('ext-a', { findings: false });
  });

  it('a resolved finding opens in the comparison run with a note naming both runs', async () => {
    const cb = renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /resolved/ }));
    fireEvent.click(await screen.findByText('Old'));
    const [route, params] = cb.onNavigate.mock.calls[0];
    expect(route).toBe('finding');
    expect(params.runId).toBe('b');
    expect(params.crumbs).toEqual(['history', expect.stringMatching(/^run /), 'security', 'p']);
    expect(params.note).toMatch(/^Resolved in the run of .+; shown as last seen in the run of .+\.$/);
  });

  it('a model filter narrows the list and says how many runs show', async () => {
    renderPage({ initialRunId: 'a' });
    fireEvent.click(await screen.findByRole('button', { name: 'filter by model' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /qwen/ }));
    expect(await screen.findByText('1 of 2 runs')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /dimensions?$/ })).toBeInTheDocument();
  });

  it('arrows with a modifier held, or inside a dialog, do not move the selection', async () => {
    const cb = renderPage();
    await screen.findByText(/vs /);
    const calls = cb.onRunChange.mock.calls.length;
    fireEvent.keyDown(document.body, { key: 'ArrowDown', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'ArrowDown', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'ArrowDown', altKey: true });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const btn = document.createElement('button');
    dialog.appendChild(btn);
    document.body.appendChild(dialog);
    fireEvent.keyDown(btn, { key: 'ArrowDown' });
    fireEvent.keyDown(btn, { key: 'Enter' });
    dialog.remove();
    expect(cb.onRunChange.mock.calls.length).toBe(calls);
    expect(cb.onRunClick).not.toHaveBeenCalled();
  });

  it('opening an archived run says it is archived, so the run page can say it is restoring', async () => {
    const cb = renderPage({}, [{ ...RUNS[0], archived: true }, RUNS[1]]);
    await screen.findByText(/comparison|vs /);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(cb.onRunClick).toHaveBeenCalledWith('a', expect.any(String), { archived: true });
  });
});
