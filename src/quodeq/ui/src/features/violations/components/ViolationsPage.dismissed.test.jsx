import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ViolationsPage from './ViolationsPage.jsx';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';

// The finding card needs the app's side pane; the page under test is the
// wiring around it, so the card is a stub here.
vi.mock('../../explorer/components/EvalCards.jsx', () => ({ EvalViolationCard: ({ v }) => <div data-testid="card">{v.title}</div> }));

// Shared projects have no mutation route on the backend (dismiss/restore/
// delete are local-only by design, and the same project id can exist in both
// worlds). The page is the wiring point between useDismissedFindings'
// handlers and the workbench's actions: for a shared project it passes
// undefined, so the buttons are absent while the dismissed list stays visible.
const sampleA = { title: 'Old A', req: 'A1', file: 'a.py', line: 10, severity: 'minor', principle: 'P1', dimension: 'security' };
const sampleB = { title: 'Old B', req: 'B1', file: 'b.py', line: 20, severity: 'major', principle: 'P2', dimension: 'security' };

const pageState = {};
vi.mock('../hooks/useViolationsPageState.js', () => ({ useViolationsPageState: () => pageState }));

beforeEach(() => {
  Object.assign(pageState, {
    dismissed: [sampleA, sampleB], dismissedLoading: false,
    handleRestore: vi.fn(), handleRestoreAll: vi.fn(), handleDelete: vi.fn(), handleDeleteAll: vi.fn(),
    restoreError: null, visibleDimensions: [], summary: { totalViolations: 0, severity: {} },
  });
});

function renderDismissed(selectedSource, workbench = { status: 'dismissed' }) {
  const QC = withQueryClient();
  const data = {
    accumulatedDimensions: [{ dimension: 'security', violations: [], compliance: [] }],
    selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }], projectsLoaded: true,
    projectName: 'p1', loading: false, isFetching: false, selectedSource,
  };
  return render(
    <QC>
      <ViolationsPage data={data} callbacks={{ onFileClick: vi.fn() }} workbench={workbench} onWorkbenchChange={() => {}} />
    </QC>,
  );
}

describe('ViolationsPage — dismissed findings in the workbench', () => {
  it('the header counts the dismissed findings', () => {
    renderDismissed('local');
    expect(screen.getByText('0 open · 2 dismissed')).toBeInTheDocument();
  });

  it('restore hands the page\'s restore handler the dismissed record', async () => {
    renderDismissed('local');
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(pageState.handleRestore).toHaveBeenCalledWith(sampleB);
  });

  it('restore all goes to the page\'s bulk handler', async () => {
    renderDismissed('local');
    fireEvent.click(await screen.findByRole('button', { name: 'restore all 2 in project' }));
    expect(pageState.handleRestoreAll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'delete all 2 in project' })).toBeInTheDocument();
  });

  it('a shared project lists the dismissed findings with no restore, delete or bulk action', async () => {
    renderDismissed('shared');
    const list = await screen.findByLabelText('Findings');
    expect(list).toHaveTextContent('Old A');
    expect(list).toHaveTextContent('Old B');
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'restore all 2 in project' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'delete all 2 in project' })).toBeNull();
  });

  it('open file shows only for a dismissed finding whose file still has an open finding', async () => {
    pageState.visibleDimensions = [{ dimension: 'security', fromRunId: 'r1', violations: [{ title: 'Still open', file: 'b.py', line: 3, severity: 'minor', req: 'B2' }] }];
    renderDismissed('local');
    expect(await screen.findByRole('button', { name: 'open file ›' })).toBeInTheDocument();
  });

  it('a dismissed finding whose file has no open finding offers no open file', async () => {
    renderDismissed('local', { status: 'dismissed', selectedId: 'dismissed|security|a.py|10|A1|Old A' });
    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { current: true })).toHaveTextContent('Old A');
    expect(screen.queryByRole('button', { name: 'open file ›' })).toBeNull();
  });

  it('while the dismissed list first loads: list skeleton, and no dismissed count in the header', async () => {
    Object.assign(pageState, { dismissed: [], dismissedLoading: true });
    const { container } = renderDismissed('local');
    expect(screen.getByText('0 open')).toBeInTheDocument();
    await screen.findByRole('textbox', { name: 'Search findings' });
    expect(container.querySelector('.wb .card-list-skeleton')).not.toBeNull();
    expect(screen.queryByText('no finding matches these filters')).toBeNull();
  });
});
