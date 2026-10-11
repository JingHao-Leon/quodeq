import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import HistoryPage from './HistoryPage.jsx';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { ApiProvider } from '../../../api/ApiContext.jsx';

// The delete handler reports failures through the side pane's toast; these
// tests never reach a failure, so a bare stub keeps them provider-free.
vi.mock('../../side-pane/SidePaneContext.jsx', () => ({
  useSidePane: () => ({ showToast: vi.fn() }),
}));

// The dashboard trend only gates the empty states; the page itself reads the
// run log.
const trend = [
  { runId: 'a', status: 'done', dateISO: '2026-10-11T00:45:04Z', dateLabel: '11 Oct 2026', numericAverage: 8.5, overallGrade: 'Good', dimensionDetails: [{ dimension: 'security', score: 8.4 }] },
];
const availableRuns = [{ runId: 'a', status: 'done', dateISO: '2026-10-11T00:45:04Z', dateLabel: '11 Oct 2026' }];

const RUN_A = {
  runId: 'a', jobId: 'ext-a', startedAt: '2026-10-11T00:45:04+00:00', status: 'done', model: 'qwen', commit: '6d62f65',
  origin: { kind: 'ci', workflow: 'Quodeq Nightly' }, dims: ['security'], partial: false, score: 8.5, grade: 'Good',
  open: 398, critical: 0, majors: 26, dimensionDetails: [{ dimension: 'security', score: 8.4, grade: 'Good', majors: 26, critical: 0 }],
  activeSeconds: 600, baselineRunId: 'b', baselineKind: 'same-model', counts: { new: 1, resolved: 0, notReevaluated: 0 },
  newSev: { major: 1 }, resolvedSev: {}, pending: false,
};
const RUN_B = {
  ...RUN_A, runId: 'b', jobId: 'ext-b', startedAt: '2026-10-10T01:36:00+00:00', score: 8.3, majors: 25,
  baselineRunId: null, baselineKind: null, counts: null, newSev: null, resolvedSev: null,
};
const DIFF = {
  dimensions: {
    security: {
      counts: { new: 1, resolved: 0, notReevaluated: 0 },
      new: [{ severity: 'major', title: 'Uncaught exception', principle: 'Fault Tolerance', file: 'a.py', line: 3 }],
      resolved: [],
    },
  },
};

function makeFakeApi(running = null) {
  return {
    deleteEvaluation: vi.fn(async () => ({ ok: true })),
    getRunLog: vi.fn(async () => ({ runs: [RUN_A, RUN_B], running })),
    getRunDiff: vi.fn(async () => DIFF),
    getEvaluationProgress: vi.fn(async () => ({ dimensions: [] })),
  };
}

function makeCallbacks(onNavigate = vi.fn()) {
  return { onRunClick: vi.fn(), onDimensionClick: vi.fn(), onNavigate, onRunChange: vi.fn(), onRunDeleted: vi.fn() };
}

function renderWithProps(props, running = null) {
  const QC = withQueryClient();
  const fakeApi = makeFakeApi(running);
  render(
    <QC>
      <ApiProvider value={fakeApi}>
        <HistoryPage callbacks={makeCallbacks()} projectsLoaded loading={false} isFetching={false} {...props} />
      </ApiProvider>
    </QC>,
  );
  return fakeApi;
}

/** A local project with two runs in its log: `a` (compared with `b`) and `b`. */
function renderHistory({ onNavigate = vi.fn(), running = null, selectedSource = 'local', ...over } = {}) {
  return renderWithProps({
    trend, availableRuns,
    selection: { selectedRunId: null },
    callbacks: makeCallbacks(onNavigate),
    projectInfo: { displayName: 'Test Project' },
    projects: [{ id: 'proj1', name: 'proj1' }],
    selectedProject: 'proj1',
    selectedSource,
    ...over,
  }, running);
}

describe('HistoryPage: the run log', () => {
  it('opens a finding from History with a History trail and the History tab lit', async () => {
    const onNavigate = vi.fn();
    renderHistory({ onNavigate });
    fireEvent.click(await screen.findByRole('tab', { name: /new/ }));
    fireEvent.click(await screen.findByText('Uncaught exception'));
    expect(onNavigate).toHaveBeenCalledWith('finding', expect.objectContaining({
      sourceTab: 'history',
      runId: 'a',
      crumbs: expect.arrayContaining(['history']),
    }));
  });

  it('a running evaluation shows one line that opens Evaluate, no live row', async () => {
    const onNavigate = vi.fn();
    renderHistory({ onNavigate, running: { jobId: 'j', startedAt: '2026-10-11T00:45:04+00:00', model: 'qwen', currentDimension: 'performance' } });
    fireEvent.click(await screen.findByRole('button', { name: /open in evaluate/ }));
    expect(onNavigate).toHaveBeenCalledWith('evaluate');
    expect(screen.queryByText(/performing an evaluation/)).toBeNull();
  });

  it('lands on the remembered run', async () => {
    renderHistory({ selection: { selectedRunId: 'b' } });
    expect(await screen.findByText(/nothing to compare with/)).toBeInTheDocument();
  });
});

describe('HistoryPage: delete-run source gating', () => {
  it('a local run can be deleted from the more menu', async () => {
    renderHistory();
    expect(await screen.findByRole('button', { name: 'more actions' })).toBeInTheDocument();
  });

  it('a shared project shows the run log without delete', async () => {
    renderHistory({ selectedSource: 'shared' });
    expect(await screen.findByRole('tab', { name: /dimensions/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'more actions' })).toBeNull();
    expect(screen.getByText('remote · read-only')).toBeInTheDocument();
  });
});

// Covers evaluate CTA gating, teammate persona (shared selection + zero
// local projects), and the shared read-only chip.
function renderHistoryPageWithData(overrides = {}) {
  return renderWithProps({
    trend: [],
    selection: { selectedRunId: null },
    availableRuns: [],
    projectInfo: null,
    projects: [],
    selectedProject: 'shared-1',
    selectedSource: 'shared',
    ...overrides,
  });
}

describe('HistoryPage: evaluate CTA gating for shared', () => {
  it('shared source, no evaluations yet: no Start evaluation CTA, shared-specific copy', () => {
    renderHistoryPageWithData();
    expect(screen.getByText('No completed evaluation yet')).toBeInTheDocument();
    expect(screen.getByText('no completed evaluation in this remote project yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start evaluation' })).toBeNull();
  });

  it('local source, no evaluations yet: Start evaluation CTA present', () => {
    renderHistoryPageWithData({ selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }] });
    expect(screen.getByRole('button', { name: 'Start evaluation' })).toBeInTheDocument();
  });
});

describe('HistoryPage: teammate persona, shared selection + zero local projects', () => {
  it('shared source with an empty LOCAL projects list renders the shared content path, not the Add-a-project wall', () => {
    renderHistoryPageWithData({ trend, availableRuns });
    expect(screen.queryByText('No projects yet')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a project' })).toBeNull();
  });

  it('local source with an empty local projects list still shows the Add-a-project wall', () => {
    renderHistoryPageWithData({ selectedSource: 'local', selectedProject: '', projects: [] });
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });
});

describe('HistoryPage: loader gate, containment, refresh dim', () => {
  it('background refetch over an empty project keeps the empty state, no loader', () => {
    renderHistoryPageWithData({ loading: false, isFetching: true });
    expect(document.querySelector('.loading-screen')).toBeNull();
    expect(screen.getByText('No completed evaluation yet')).toBeInTheDocument();
  });

  it('initial load renders the history skeleton inside the page frame, no spinner', () => {
    renderHistoryPageWithData({ loading: true, isFetching: true });
    expect(document.querySelector('.loading-screen')).toBeNull();
    const skeleton = document.querySelector('.history-skeleton');
    expect(skeleton).not.toBeNull();
    expect(document.querySelector('.history-page--terminal').contains(skeleton)).toBe(true);
  });

  it('applies the refresh dim class to the empty state during a background refetch', () => {
    renderHistoryPageWithData({ loading: false, isFetching: true });
    expect(document.querySelector('.history-page--terminal').className).toContain('section-pending');
  });

  it('applies the refresh dim class to the run log during a background refetch', () => {
    renderHistory({ isFetching: true });
    expect(document.querySelector('.history-page--terminal').className).toContain('section-pending');
  });
});

describe('HistoryPage: error state + retry feedback', () => {
  it('error + no data renders the framed error state with a working Retry', () => {
    const onRetry = vi.fn();
    renderHistoryPageWithData({ selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }], error: 'Failed to load', onRetry });
    expect(screen.getByText("Couldn't load this project")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('error + isFetching renders the skeleton instead of the error state', () => {
    renderHistoryPageWithData({ selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }], error: 'Failed to load', isFetching: true });
    expect(screen.queryByText("Couldn't load this project")).toBeNull();
    expect(document.querySelector('.history-skeleton')).toBeTruthy();
  });

  it('data present with a stale error still renders the data, not the error screen', () => {
    renderHistory({ error: 'Failed to load' });
    expect(screen.queryByText("Couldn't load this project")).toBeNull();
  });

  it('a local project has no read-only chip', () => {
    renderHistory();
    expect(screen.queryByText('remote · read-only')).toBeNull();
  });
});
