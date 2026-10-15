import { describe, it, expect, vi } from 'vitest';
import { historyRoute } from './historyRoute.jsx';

function routeProps(overrides = {}) {
  return {
    dashboardData: { dashboard: { trend: [], partialRuns: [] }, accumulated: null, availableRuns: [], loading: false, isFetching: false, error: null },
    navigation: {
      historySelectedRun: null, projects: [], projectsLoaded: true, selectedProject: 'proj1', selectedSource: 'local',
      handleNavigate: vi.fn(), setHistorySelectedRun: vi.fn(),
    },
    handleRunDeleted: vi.fn(),
    ...overrides,
  };
}

describe('historyRoute', () => {
  it('passes handleRunDeleted as the History onRunDeleted callback', () => {
    const props = routeProps();
    const el = historyRoute({}, props);
    expect(el.props.callbacks.onRunDeleted).toBe(props.handleRunDeleted);
  });

  it('passes a remembered run through even when the trend lacks it (partial runs live in the log)', () => {
    const props = routeProps();
    props.navigation.historySelectedRun = 'partial-run';
    expect(historyRoute({}, props).props.selection.selectedRunId).toBe('partial-run');
    props.navigation.historySelectedRun = 'latest';
    expect(historyRoute({}, props).props.selection.selectedRunId).toBeNull();
  });

  it('opens a run\'s dimension as of the run with History still lit (sourceTab)', () => {
    const props = routeProps();
    historyRoute({}, props).props.callbacks.onDimensionClick({ dimension: 'security', fromRunId: 'r2', fromDateLabel: 'Thu 8 Oct 08:23' });
    expect(props.navigation.handleNavigate).toHaveBeenCalledWith('explorer', expect.objectContaining({ dimension: 'security', runId: 'r2', sourceTab: 'history' }));
  });

  it('opens a run on the run page', () => {
    const props = routeProps();
    historyRoute({}, props).props.callbacks.onRunClick('r2', 'Thu 8 Oct 08:23');
    expect(props.navigation.handleNavigate).toHaveBeenCalledWith('history-run', { runId: 'r2', dateLabel: 'Thu 8 Oct 08:23' });
  });
});
