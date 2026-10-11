import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import RunLogPage from './RunLogPage.jsx';

const detailRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('./RunDetail.jsx', () => ({ default: () => { detailRenders.count += 1; return null; } }));

const base = { status: 'done', model: 'qwen', origin: { kind: 'app' }, dims: ['security'], partial: false, grade: 'Good', open: 10, critical: 0, majors: 2,
  dimensionDetails: [{ dimension: 'security', score: 8.4, critical: 0, majors: 2 }], pending: false, baselineRunId: null, counts: null, score: 8.4 };
const RUNS = [
  { ...base, runId: 'a', jobId: 'ext-a', startedAt: '2026-10-11T00:45:04+00:00' },
  { ...base, runId: 'b', jobId: 'ext-b', startedAt: '2026-10-10T01:36:00+00:00' },
];

function renderPage() {
  const api = {
    getRunLog: vi.fn(async () => ({ runs: RUNS, running: null })), getRunDiff: vi.fn(async () => ({ dimensions: {} })),
    getEvaluationProgress: vi.fn(async () => ({ dimensions: [] })), getDashboard: vi.fn(async () => ({})), getProjectScores: vi.fn(async () => ({})),
  };
  const Wrapper = withStableQueryApi(api);
  render(<Wrapper><RunLogPage project="p1" onRunChange={vi.fn()} onNavigate={vi.fn()} /></Wrapper>);
  return api;
}

const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('RunLogPage: hover', () => {
  it('hovering a run warms its run page; leaving before the dwell warms nothing', async () => {
    const api = renderPage();
    await screen.findByText('runs · 2');
    const rows = document.querySelectorAll('.rl-row');
    fireEvent.mouseEnter(rows[0]);
    fireEvent.mouseLeave(rows[0]);
    await pause(300);
    expect(api.getDashboard).not.toHaveBeenCalled();
    fireEvent.mouseEnter(rows[1]);
    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledWith('p1', 'b'));
  });

  it('hover does not re-render the selected run panel', async () => {
    renderPage();
    await screen.findByText('runs · 2');
    await pause(50);
    const before = detailRenders.count;
    const rows = document.querySelectorAll('.rl-row');
    fireEvent.mouseEnter(rows[1]);
    fireEvent.mouseLeave(rows[1]);
    fireEvent.mouseEnter(rows[0]);
    expect(detailRenders.count).toBe(before);
  });
});
