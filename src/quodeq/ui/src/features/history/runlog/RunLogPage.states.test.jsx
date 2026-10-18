import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import RunLogPage from './RunLogPage.jsx';

const base = { status: 'done', origin: { kind: 'app' }, partial: false, grade: 'Good', open: 10, pending: false, baselineRunId: null, counts: null };
const TWO_DIMS = {
  ...base, runId: 'a', jobId: 'ext-a', startedAt: '2026-10-11T00:45:04+00:00', model: 'qwen', dims: ['security', 'usability'],
  score: 6.0, critical: 4, majors: 11,
  dimensionDetails: [{ dimension: 'security', score: 8.0, grade: 'Good', critical: 1, majors: 2 }, { dimension: 'usability', score: 4.0, grade: 'Poor', critical: 3, majors: 9 }],
};
const OLDER = { ...TWO_DIMS, runId: 'b', jobId: 'ext-b', startedAt: '2026-10-10T01:36:00+00:00', model: 'gpt' };

function renderPage({ runs = [TWO_DIMS, OLDER], project = 'p1', ...props } = {}) {
  const api = { getRunLog: vi.fn(async () => ({ runs, running: null })), getRunDiff: vi.fn(async () => ({ dimensions: {} })), getEvaluationProgress: vi.fn(async () => ({ dimensions: [] })) };
  const Wrapper = withStableQueryApi(api);
  return render(<Wrapper><RunLogPage project={project} onRunChange={vi.fn()} onNavigate={vi.fn()} {...props} /></Wrapper>);
}

beforeEach(() => sessionStorage.clear());

describe('RunLogPage: hidden standards', () => {
  it('a hidden dimension leaves the dimensions tab and the run score and severity', async () => {
    renderPage({ visibleSet: new Set(['security']) });
    expect(await screen.findByRole('tab', { name: /1 dimension$/ })).toBeInTheDocument();
    expect(screen.queryByText('usability')).toBeNull();
    const hero = document.querySelector('.rl-hero');
    expect(hero.querySelector('.rl-hero__score')).toHaveTextContent('8.0');
    expect(hero).toHaveTextContent('1 crit');
    expect(hero).toHaveTextContent('2 maj');
  });
});

describe('RunLogPage: filters survive leaving History', () => {
  it('restores the model filter for the same project only', async () => {
    const first = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'filter by model' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /qwen/ }));
    first.unmount();
    const again = renderPage();
    expect(await screen.findByText('1 of 2 runs')).toBeInTheDocument();
    again.unmount();
    renderPage({ project: 'p2' });
    await screen.findByRole('button', { name: 'filter by model' });
    expect(screen.queryByText(/of 2 runs/)).toBeNull();
  });
});

describe('RunLogPage: no runs to show', () => {
  it('an empty log says so in the list and hides the strip', async () => {
    renderPage({ runs: [] });
    expect(await screen.findByText('No finished runs yet.')).toBeInTheDocument();
    expect(document.querySelector('.rl-strip')).toBeNull();
  });

  it('filters that match nothing say so and offer to clear them', async () => {
    sessionStorage.setItem('quodeq.history.filters', JSON.stringify({ p1: { origin: 'all', model: 'gone' } }));
    renderPage();
    expect(await screen.findByText('No runs match these filters.')).toBeInTheDocument();
    expect(document.querySelector('.rl-strip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'clear filters' }));
    expect(await screen.findByText('runs · 2')).toBeInTheDocument();
  });
});

describe('RunLogPage: the strip needs runs that compare against the same model', () => {
  it('stays hidden while no two runs have a same-model baseline', async () => {
    renderPage();
    await screen.findByText('runs · 2');
    expect(document.querySelector('.rl-strip')).toBeNull();
  });

  it('shows once two runs plot a comparison', async () => {
    const compared = { baselineKind: 'same-model', counts: { new: 1, resolved: 0 } };
    renderPage({ runs: [{ ...TWO_DIMS, ...compared }, { ...OLDER, ...compared }] });
    await screen.findByText('runs · 2');
    expect(document.querySelector('.rl-strip')).not.toBeNull();
  });
});
