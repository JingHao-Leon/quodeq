/**
 * The History tab's route renderer.
 */
import { lazy } from 'react';
import { LATEST_RUN_ID } from '../constants.js';
import { NAV_TAB } from '../vocab/navTab.js';
import { findProject } from '../utils/projectIdentity.js';

const HistoryPage = lazy(() => import('../features/history/components/HistoryPage.jsx'));

// The run log holds runs the trend does not (partial ones), so any remembered
// run is passed through; the log falls back to its newest run when it is gone.
function resolveHistorySelectedRunId(selectedRun) {
  return selectedRun && selectedRun !== LATEST_RUN_ID ? selectedRun : null;
}

export function historyRoute(params, props) {
  const trend = props.dashboardData.dashboard?.trend || [];
  const runs = props.dashboardData.availableRuns || [];
  return (
    <HistoryPage
      trend={trend}
      partialRuns={props.dashboardData.dashboard?.partialRuns || []}
      selection={{
        selectedRunId: resolveHistorySelectedRunId(props.navigation.historySelectedRun),
        selectedRunScore: props.dashboardData.accumulated?.summary?.numericAverage,
      }}
      availableRuns={runs}
      callbacks={{
        // An archived run carries the mark, so the run page says it is restoring.
        onRunClick: (runId, dateLabel, { archived = false } = {}) => props.navigation.handleNavigate(
          NAV_TAB.HISTORY_RUN, archived ? { runId, dateLabel, archived } : { runId, dateLabel },
        ),
        // A run's dimension opens as of the run, with History still lit in the sidebar.
        onDimensionClick: (dim) => props.navigation.handleNavigate(NAV_TAB.EXPLORER, {
          dimension: dim.dimension, runId: dim.fromRunId, dateLabel: dim.fromDateLabel, fromProject: dim.fromProject, sourceTab: NAV_TAB.HISTORY,
        }),
        onNavigate: props.navigation.handleNavigate,
        onRunChange: props.navigation.setHistorySelectedRun,
        // Drops the run from every cached run list at once, resets a
        // selection that pointed at it, then the same debounced rollup
        // reconcile dismiss/restore use, plus a projects reload.
        onRunDeleted: props.handleRunDeleted,
      }}
      projects={props.navigation.projects}
      projectsLoaded={props.navigation.projectsLoaded}
      selectedProject={props.navigation.selectedProject}
      selectedSource={props.navigation.selectedSource}
      loading={props.dashboardData.loading}
      isFetching={props.dashboardData.isFetching}
      error={props.dashboardData.error}
      onRetry={props.dashboardData.onRetry}
      projectInfo={findProject(props.navigation.projects, props.navigation.selectedProject)}
    />
  );
}
