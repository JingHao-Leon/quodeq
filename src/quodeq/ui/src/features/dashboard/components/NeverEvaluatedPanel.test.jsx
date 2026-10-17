import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import DashboardContent from './DashboardContent.jsx';
import NeverEvaluatedPanel from './NeverEvaluatedPanel.jsx';
import { NAV_TAB } from '../../../vocab/navTab.js';
import { RUN_STATE } from '../../../vocab/runState.js';

// The Overview of a project with no completed evaluation: never evaluated
// says what comes next, failed attempts keep the did-not-finish copy.
function renderContent(availableRuns, projectInfo = { name: 'billing' }) {
  const onNavigate = vi.fn();
  render(
    <DashboardContent
      runMode={false}
      data={{ accumulatedDimensions: [], availableRuns, selectedProject: 'billing', projectInfo, selectedSource: 'local' }}
      focus={{ dimension: null, setDimension: vi.fn(), dimensionData: null }}
      callbacks={{ onNavigate }}
    />,
  );
  return { onNavigate };
}

describe('Overview with no completed evaluation', () => {
  it('no runs shows the never-evaluated panel', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderContent([]);
    expect(screen.getByRole('heading', { name: 'billing has not been evaluated yet' })).toBeInTheDocument();
    expect(screen.queryByText(/didn't finish cleanly/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'start first evaluation' }));
    expect(onNavigate).toHaveBeenCalledWith(NAV_TAB.EVALUATE);
  });

  it('failed runs keep the did-not-finish copy', () => {
    renderContent([{ runId: 'r1', status: RUN_STATE.FAILED }]);
    expect(screen.getByText(/didn't finish cleanly/)).toBeInTheDocument();
    expect(screen.queryByText(/has not been evaluated yet/)).not.toBeInTheDocument();
  });

  it('a first evaluation still running keeps its own copy', () => {
    renderContent([{ runId: 'r1', status: RUN_STATE.RUNNING }]);
    expect(screen.getByText('First evaluation in progress')).toBeInTheDocument();
    expect(screen.queryByText(/has not been evaluated yet/)).not.toBeInTheDocument();
  });
});

describe('NeverEvaluatedPanel steps', () => {
  it('ticks the scan with its files and languages, and choose opens Evaluate', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NeverEvaluatedPanel projectName="billing" projectInfo={{ totalFiles: 42, languageStats: { py: 30, ts: 12 } }} onNavigate={onNavigate} />);
    expect(screen.getByText(/42 source files/)).toBeInTheDocument();
    expect(screen.getByText('pick who reviews it.')).toBeInTheDocument();
    expect(screen.getByText('grades land here')).toBeInTheDocument();
    const choose = screen.getByRole('button', { name: 'choose' });
    expect(choose).toHaveClass('term-btn', 'term-btn--secondary');
    await user.click(choose);
    expect(onNavigate).toHaveBeenCalledWith(NAV_TAB.EVALUATE);
  });

  it('without scan facts the scan step is a plain tick', () => {
    render(<NeverEvaluatedPanel projectName="billing" projectInfo={null} onNavigate={vi.fn()} />);
    expect(screen.getByText('scan')).toBeInTheDocument();
    expect(screen.queryByText(/source files/)).not.toBeInTheDocument();
  });
});
