import { useMemo } from 'react';
import { useApi } from '../../../api/ApiContext.jsx';
import { readVisibleStandardIds } from '../../../utils/visibleStandards.js';
import { filterRunsByVisibleStandards, filterTrendByVisibleStandards } from '../../../utils/scoreFiltering.js';
import { t } from '../../../strings/index.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { LATEST_RUN_ID } from '../../../constants.js';
import { useHistoryDeleteRun } from '../hooks/useHistoryDeleteRun.js';
import RunLogPage from '../runlog/RunLogPage.jsx';
import {
  HistoryEmptyShell, NoProjectSelectedEmptyContent, LoadingEmptyContent,
} from './HistoryEmptyStates.jsx';
import {
  LoadProjectFailedEmptyState, NoEvalsEmptyState, NoProjectsEmptyState, SharedNoCompletedEvalEmptyState,
} from '../../../components/ProjectEmptyStates.jsx';
import { assembleHistoryRows, visibleHistoryRows } from './historyRowAssembly.js';

export { assembleHistoryRows, visibleHistoryRows };

// The "no rows to show" branch of the empty-state dispatch (loading / error /
// shared-no-evals / generic-no-evals).
function renderNoRowsEmptyState({
  selectedSource, loading, error, isFetching, isRefreshing, projectInfo, selectedProject, onNavigate, onRetry,
}) {
  // A retry in flight (error still set, isFetching true) shows the loader
  // rather than the error, so clicking Retry visibly does something.
  if (loading || (error && isFetching)) {
    return <HistoryEmptyShell sub={t('overview.loading')}><LoadingEmptyContent /></HistoryEmptyShell>;
  }
  // A failed fetch with nothing to show must render as an error, not the
  // "no evaluations yet" empty state -- otherwise a 404/500/timeout tells
  // the user their existing evaluations are gone.
  if (error) {
    return (
      <HistoryEmptyShell sub={t('violations.subError')}>
        <LoadProjectFailedEmptyState error={error} onRetry={onRetry} />
      </HistoryEmptyShell>
    );
  }
  // Shared projects are read-only in the app -- evaluations only ever run
  // locally, so "Start evaluation" has nowhere useful to send a
  // shared-project viewer (see DashboardPage's NoCompletedEvalPanel, the
  // precedent this mirrors).
  if (selectedSource === PROJECT_SOURCE.SHARED) {
    return (
      <HistoryEmptyShell sub={t('violations.subNoEvals')} refreshing={isRefreshing}>
        <SharedNoCompletedEvalEmptyState />
      </HistoryEmptyShell>
    );
  }
  const projectName = projectInfo?.displayName || projectInfo?.name || selectedProject;
  return (
    <HistoryEmptyShell sub={t('violations.subNoEvals')} refreshing={isRefreshing}>
      <NoEvalsEmptyState projectName={projectName} onNavigate={onNavigate} />
    </HistoryEmptyShell>
  );
}

// Empty-state dispatch: which branch applies, and in what order. The
// per-branch content lives in HistoryEmptyStates.jsx.
function renderHistoryEmptyState({
  projectsLoaded, projects, selectedSource, selectedProject, onNavigate,
  availableRuns, trend, partialRuns, loading, error, isFetching, isRefreshing, projectInfo, onRetry,
}) {
  if (!projectsLoaded) return <HistoryEmptyShell sub={t('overview.loading')}><LoadingEmptyContent /></HistoryEmptyShell>;
  // The LOCAL projects list can legitimately be empty while a teammate is
  // viewing a shared project (they may have never added a local project of
  // their own) -- gate this wall on the local list only for local selections,
  // so a shared selection falls through to the normal shared data flow below.
  if (projects.length === 0 && selectedSource !== PROJECT_SOURCE.SHARED) {
    return (
      <HistoryEmptyShell sub={t('violations.subNoProjects')}>
        <NoProjectsEmptyState onNavigate={onNavigate} />
      </HistoryEmptyShell>
    );
  }
  if (!selectedProject) {
    return (
      <HistoryEmptyShell sub={t('violations.subNoProjectSelected')}>
        <NoProjectSelectedEmptyContent onNavigate={onNavigate} />
      </HistoryEmptyShell>
    );
  }
  // Guard on the rows the table will actually show (trend + partial +
  // in-progress, minus hidden failures), not just `trend`. A project whose
  // only runs are cancelled has an empty trend but real rows to list, and
  // its scores already show on the Overview.
  if (visibleHistoryRows(availableRuns, trend, partialRuns).length === 0) {
    return renderNoRowsEmptyState({
      selectedSource, loading, error, isFetching, isRefreshing, projectInfo, selectedProject, onNavigate, onRetry,
    });
  }
  return null;
}

export default function HistoryPage({ trend: rawTrend, partialRuns: rawPartialRuns = [], selection, availableRuns, callbacks, projectInfo, projects = [], projectsLoaded, selectedProject, selectedSource = PROJECT_SOURCE.LOCAL, loading, isFetching, error, onRetry }) {
  const { selectedRunId } = selection;
  const { onRunClick, onDimensionClick, onNavigate, onRunChange, onRunDeleted } = callbacks;
  const { deleteEvaluation } = useApi();
  const visibleSet = useMemo(() => new Set(readVisibleStandardIds()), []);
  const trend = useMemo(() => filterTrendByVisibleStandards(rawTrend || [], visibleSet), [rawTrend, visibleSet]);
  const partialRuns = useMemo(() => filterRunsByVisibleStandards(rawPartialRuns, visibleSet), [rawPartialRuns, visibleSet]);

  const { handleDeleteRun } = useHistoryDeleteRun({ selectedSource, deleteEvaluation, onRunDeleted });

  const isRefreshing = isFetching && !loading;
  const emptyState = renderHistoryEmptyState({
    projectsLoaded, projects, selectedSource, selectedProject, onNavigate,
    availableRuns, trend, partialRuns, loading, error, isFetching, isRefreshing, projectInfo, onRetry,
  });
  if (emptyState) return emptyState;

  const shared = selectedSource === PROJECT_SOURCE.SHARED;
  return (
    <RunLogPage
      project={selectedProject}
      shared={shared}
      refreshing={isRefreshing}
      initialRunId={selectedRunId && selectedRunId !== LATEST_RUN_ID ? selectedRunId : null}
      onRunChange={onRunChange}
      onRunClick={onRunClick}
      onDimensionClick={onDimensionClick}
      onNavigate={onNavigate}
      // Shared-repo runs have no delete route on the backend (mutation is
      // local-only by design): no handler, so the run panel has no delete.
      onDeleteRun={selectedSource === PROJECT_SOURCE.LOCAL ? handleDeleteRun : undefined}
    />
  );
}
