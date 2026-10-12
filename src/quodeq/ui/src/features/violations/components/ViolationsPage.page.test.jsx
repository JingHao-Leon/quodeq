import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ViolationsPage from './ViolationsPage.jsx';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { ApiProvider } from '../../../api/ApiContext.jsx';

// The finding card needs the app's side pane; the page under test is the
// wiring around it, so the card is a stub here.
vi.mock('../../explorer/components/EvalCards.jsx', () => ({ EvalViolationCard: ({ v }) => <div data-testid="card">{v.title}</div> }));

// Covers evaluate CTA gating, teammate persona (shared selection + zero
// local projects), and the shared read-only chip. ViolationsPage's default
// export needs a QueryClientProvider (useDismissedFindings calls
// useQueryClient()).
function baseData(overrides = {}) {
  return {
    accumulatedDimensions: [],
    selectedProject: 'shared-1',
    projects: [],
    projectsLoaded: true,
    projectName: 'Shared Repo',
    loading: false,
    isFetching: false,
    selectedSource: 'shared',
    ...overrides,
  };
}

function renderPage(data, callbacks = {}) {
  const QC = withQueryClient();
  return render(
    <QC>
      <ViolationsPage data={data} callbacks={callbacks} />
    </QC>
  );
}

describe('ViolationsPage — evaluate CTA gating for shared (Critical 1)', () => {
  it('shared source, no evaluations yet: no Start evaluation CTA, shared-specific copy', () => {
    renderPage(baseData());
    expect(screen.getByText('No completed evaluation yet')).toBeInTheDocument();
    expect(screen.getByText('no completed evaluation in this remote project yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start evaluation' })).toBeNull();
  });

  it('local source, no evaluations yet: Start evaluation CTA present (existing behavior)', () => {
    renderPage(baseData({
      selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }],
    }));
    expect(screen.getByRole('button', { name: 'Start evaluation' })).toBeInTheDocument();
  });
});

describe('ViolationsPage — teammate persona: shared selection + zero local projects (Finding 3)', () => {
  it('shared source with an empty LOCAL projects list renders the shared content path, not the Add-a-project wall', () => {
    renderPage(baseData({
      accumulatedDimensions: [{ dimension: 'security', violations: [], compliance: [] }],
    }));
    expect(screen.queryByText('No projects yet')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a project' })).toBeNull();
  });

  it('local source with an empty local projects list still shows the Add-a-project wall (unchanged)', () => {
    renderPage(baseData({ selectedSource: 'local', selectedProject: '', projects: [] }));
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });
});

// Mounting the page is plain navigation, not a mutation. It must not mark
// the dashboard stale (a stale dashboard refetches 10-20 MB the moment the
// Overview remounts its observer) and must never reach onReconcile, which is
// reserved for the Dismissed sub-tab's mutation handlers.
describe('ViolationsPage — mounting does not refresh', () => {
  it('calls neither onRefresh nor onReconcile on mount', () => {
    const onRefresh = vi.fn();
    const onReconcile = vi.fn();
    renderPage(
      baseData({ selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }] }),
      { onRefresh, onReconcile },
    );
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onReconcile).not.toHaveBeenCalled();
  });
});

describe('ViolationsPage — scenario 9: loader gate, containment, refresh dim', () => {
  it('background refetch over an empty project keeps the empty state, no loader', () => {
    const { container } = renderPage(baseData({ loading: false, isFetching: true }));
    expect(container.querySelector('.loading-screen')).toBeNull();
    expect(screen.getByText('No completed evaluation yet')).toBeInTheDocument();
  });

  it('initial load renders the violations skeleton inside the page frame, no spinner', () => {
    const { container } = renderPage(baseData({ loading: true, isFetching: true }));
    expect(container.querySelector('.loading-screen')).toBeNull();
    const skeleton = container.querySelector('.violations-skeleton');
    expect(skeleton).not.toBeNull();
    const frame = container.querySelector('.violations-page--terminal');
    expect(frame).not.toBeNull();
    expect(frame.contains(skeleton)).toBe(true);
  });

  it('applies the refresh dim class to the empty state during a background refetch', () => {
    const { container } = renderPage(baseData({ loading: false, isFetching: true }));
    expect(container.querySelector('.violations-page--terminal').className).toContain('section-pending');
  });

  it('applies the refresh dim class to real content during a background refetch', () => {
    const { container } = renderPage(baseData({
      accumulatedDimensions: [{ dimension: 'security', violations: [], compliance: [] }],
      loading: false, isFetching: true,
    }));
    expect(container.querySelector('.violations-page--terminal').className).toContain('section-pending');
  });
});

describe('ViolationsPage — error state + retry feedback (P4-T2)', () => {
  it('error + no data renders the framed error state with a working Retry', () => {
    const onRetry = vi.fn();
    renderPage(
      baseData({ selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }], error: 'Failed to load' }),
      { onRetry },
    );
    expect(screen.getByText("Couldn't load this project")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('error + isFetching renders the skeleton instead of the error state', () => {
    const { container } = renderPage(
      baseData({ selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }], error: 'Failed to load', isFetching: true }),
    );
    expect(screen.queryByText("Couldn't load this project")).toBeNull();
    expect(container.querySelector('.violations-skeleton')).toBeTruthy();
    expect(container.querySelector('.loading-screen')).toBeNull();
  });

  it('data present with a stale error still renders the data, not the error screen', () => {
    renderPage(baseData({
      selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }],
      accumulatedDimensions: [{ dimension: 'security', violations: [], compliance: [] }],
      error: 'Failed to load',
    }));
    expect(screen.queryByText("Couldn't load this project")).toBeNull();
  });
});

const WB_DIMS = [{
  dimension: 'security',
  fromRunId: 'run-1',
  violations: [
    { title: 'Weak hash', file: 'src/a.py', line: 3, severity: 'minor', principle: 'P1', req: 'S-1' },
    { title: 'Key logged', file: 'lib/b.py', line: 9, severity: 'major', principle: 'P2', req: 'S-2' },
  ],
  compliance: [],
}];
const localData = () => baseData({
  selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }], accumulatedDimensions: WB_DIMS,
});
const noDismissedApi = { listDismissedFindings: async () => [] };

function renderWorkbench(callbacks = {}, extra = {}) {
  const QC = withQueryClient();
  return render(
    <QC>
      <ApiProvider value={noDismissedApi}>
        <ViolationsPage data={localData()} callbacks={callbacks} workbench={null} onWorkbenchChange={() => {}} {...extra} />
      </ApiProvider>
    </QC>,
  );
}

describe('ViolationsPage — findings workbench', () => {
  it('the header sub-line counts open findings by severity and the dismissed ones', () => {
    renderWorkbench();
    expect(screen.getByText('2 open · 1 maj · 1 min · 0 dismissed')).toBeInTheDocument();
  });

  it('the four view pills are gone', () => {
    renderWorkbench();
    expect(screen.queryByRole('group', { name: 'Group violations' })).toBeNull();
    expect(screen.queryByText('by-file')).toBeNull();
  });

  it('lists the findings with the most severe one selected', async () => {
    renderWorkbench();
    expect(await screen.findByText('2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Weak hash')).toBeInTheDocument();
    expect(screen.getByRole('button', { current: true })).toHaveTextContent('Key logged');
  });

  it('open file hands the File page the object of the finding\'s file', async () => {
    const onFileClick = vi.fn();
    renderWorkbench({ onFileClick });
    fireEvent.click(await screen.findByRole('button', { name: 'open file ›' }));
    expect(onFileClick).toHaveBeenCalledTimes(1);
    const fileObj = onFileClick.mock.calls[0][0];
    expect(fileObj.file).toBe('lib/b.py');
    expect(fileObj.total).toBe(1);
    expect(fileObj.major).toBe(1);
  });

  it('a workbench change goes to onWorkbenchChange (the route replaces its entry)', async () => {
    const onWorkbenchChange = vi.fn();
    renderWorkbench({}, { onWorkbenchChange });
    fireEvent.click(await screen.findByText('Weak hash'));
    expect(onWorkbenchChange).toHaveBeenCalledWith(expect.objectContaining({ selectedId: expect.stringContaining('src/a.py') }));
  });
});

describe('ViolationsPage — shared read-only chip (Finding 6)', () => {
  it('shows the chip for a shared project with data', () => {
    renderPage(baseData({
      accumulatedDimensions: [{ dimension: 'security', violations: [], compliance: [] }],
    }));
    expect(screen.getByText('remote · read-only')).toBeInTheDocument();
  });

  it('omits the chip for a local project', () => {
    renderPage(baseData({
      selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }],
      accumulatedDimensions: [{ dimension: 'security', violations: [], compliance: [] }],
    }));
    expect(screen.queryByText('remote · read-only')).toBeNull();
  });
});
