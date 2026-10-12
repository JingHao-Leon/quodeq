import { TermHeader } from '../../../components/terminal/index.js';
import { renderViolationsEmptyState } from './ViolationsEmptyStates.jsx';
import { useViolationsPageState } from '../hooks/useViolationsPageState.js';
import { useWorkbenchActions } from '../hooks/useWorkbenchActions.js';
import SharedReadOnlyBadge from '../../../components/SharedReadOnlyBadge.jsx';
import { t } from '../../../strings/index.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import DeferredMount from '../../../components/DeferredMount.jsx';
import CardListSkeleton from '../../../components/CardListSkeleton.jsx';
import FindingsWorkbench from '../workbench/FindingsWorkbench.jsx';
import { sevAbbr } from '../workbench/sevWords.js';

const SUMMARY_SEP = ' · ';

/** `N open · X crit · Y maj · Z min · W dismissed`, leaving out the empty severities. */
function summaryLine(summary, dismissedCount) {
  const sev = summary.severity || {};
  const parts = [t('violations.wbSummaryOpen', { count: summary.totalViolations || 0 })];
  SEVERITY_ORDER.forEach((l) => {
    if (sev[l] > 0) parts.push(t('violations.wbSevCount', { count: sev[l], sev: sevAbbr(l) }));
  });
  parts.push(t('violations.wbSummaryDismissed', { count: dismissedCount }));
  return parts.join(SUMMARY_SEP);
}

function ViolationsHeader({ summary, selectedSource, dismissedCount }) {
  return (
    <div className="term-page-top violations-page__top">
      <TermHeader name={t('violations.termName')} sub={summaryLine(summary, dismissedCount)}
        badge={selectedSource === PROJECT_SOURCE.SHARED ? <SharedReadOnlyBadge /> : null} />
    </div>
  );
}

function Banners({ restoreError, dismissError, dismissNotice }) {
  return (
    <>
      {restoreError && <div className="error-banner" role="alert">{restoreError}</div>}
      {dismissError && <div className="error-banner" role="alert">{dismissError}</div>}
      {dismissNotice && <div className="info-banner" role="status">{dismissNotice}</div>}
    </>
  );
}

export default function ViolationsPage({ data, callbacks, tabKey = 0, workbench = null, onWorkbenchChange }) {
  const { accumulatedDimensions = [], selectedProject, selectedSource = PROJECT_SOURCE.LOCAL } = data;
  const { projects = [], projectsLoaded, projectName, loading, isFetching, error } = data;
  const { onNavigate, onReconcile, onRetry } = callbacks;

  const pageState = useViolationsPageState({ tabKey, selectedProject, onReconcile, accumulatedDimensions, selectedSource });
  const { dismissed, restoreError, visibleDimensions, summary } = pageState;
  const { actions, error: dismissError, notice: dismissNotice } = useWorkbenchActions({
    visibleDimensions, selectedProject, selectedSource, callbacks, handlers: pageState,
  });

  const emptyState = renderViolationsEmptyState({
    projectsLoaded, projects, selectedSource, selectedProject, onNavigate,
    accumulatedDimensions, loading, isFetching, error, projectName, onRetry,
  });
  if (emptyState) return emptyState;
  const isRefreshing = isFetching && !loading;

  return (
    <div className={`violations-page violations-page--terminal${isRefreshing ? ' section-pending' : ''}`}>
      <Banners restoreError={restoreError} dismissError={dismissError} dismissNotice={dismissNotice} />
      <ViolationsHeader summary={summary} selectedSource={selectedSource} dismissedCount={dismissed.length} />
      {/* The header paints on the click; the workbench (every finding,
          flattened and filtered) follows in the next commit. */}
      <DeferredMount fallback={<CardListSkeleton />}>
        <FindingsWorkbench dims={visibleDimensions} dismissed={dismissed} workbench={workbench}
          onWorkbenchChange={onWorkbenchChange} actions={actions} />
      </DeferredMount>
    </div>
  );
}
