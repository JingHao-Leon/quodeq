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
import { formatShortDate } from '../../../utils/formatters.js';
import { useShownData } from '../hooks/useAsOfScores.js';
import ScopedFindings from '../scope/ScopedFindings.jsx';

const SUMMARY_SEP = ' · ';

/**
 * `N open · X crit · Y maj · Z min · W dismissed`, leaving out the empty
 * severities, and the dismissed count while the dismissed list first loads.
 */
function summaryLine(summary, dismissedCount) {
  const sev = summary.severity || {};
  const parts = [t('violations.wbSummaryOpen', { count: summary.totalViolations || 0 })];
  SEVERITY_ORDER.forEach((l) => {
    if (sev[l] > 0) parts.push(t('violations.wbSevCount', { count: sev[l], sev: sevAbbr(l) }));
  });
  if (dismissedCount != null) parts.push(t('violations.wbSummaryDismissed', { count: dismissedCount }));
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

/** A run day ('YYYY-MM-DD') read at local noon, so no time zone moves it to the day before. */
const NOON = 'T12:00:00';
const dayDate = (day) => new Date(`${day}${NOON}`);

/** A past day's view: which day, and the way back to today. */
function AsOfBanner({ asOf, onBack }) {
  if (!asOf) return null;
  const date = asOf.day ? formatShortDate(dayDate(asOf.day).toISOString()) : asOf.runId;
  return (
    <div className="info-banner violations-asof" role="status">
      <span>{t('violations.asOfBanner', { date })}</span>
      {onBack && <button type="button" className="wb-link" onClick={onBack}>{t('violations.asOfBack')}</button>}
    </div>
  );
}

/** The dismissed count the header shows: none on a past day, nor while the dismissed list first loads. */
function shownDismissedCount({ asOf, dismissed, dismissedLoading }) {
  return asOf || (dismissedLoading && !dismissed.length) ? null : dismissed.length;
}

/** The page frame: the past-day banner and the action banners above the body. */
function PageFrame({ refreshing, asOf, onBackToToday, banners, children }) {
  return (
    <div className={`violations-page violations-page--terminal${refreshing ? ' section-pending' : ''}`}>
      <AsOfBanner asOf={asOf} onBack={onBackToToday} />
      <Banners {...banners} />
      {children}
    </div>
  );
}

export default function ViolationsPage({ data: given, callbacks, workbench = null, onWorkbenchChange }) {
  const data = useShownData(given);
  const { accumulatedDimensions = [], selectedProject, selectedSource = PROJECT_SOURCE.LOCAL, asOf = null, scope = null } = data;
  const { projects = [], projectsLoaded, projectName, loading, isFetching, error } = data;
  const { onNavigate, onReconcile, onRetry } = callbacks;

  const pageState = useViolationsPageState({ selectedProject, onReconcile, accumulatedDimensions, selectedSource });
  const { dismissed, dismissedLoading, restoreError, visibleDimensions, summary } = pageState;
  const { actions, error: dismissError, notice: dismissNotice } = useWorkbenchActions({
    visibleDimensions, selectedProject, selectedSource, callbacks, handlers: pageState, readOnly: Boolean(asOf),
  });

  const emptyState = renderViolationsEmptyState({
    projectsLoaded, projects, selectedSource, selectedProject, onNavigate,
    accumulatedDimensions, loading, isFetching, error, projectName, onRetry,
  });
  if (emptyState) return emptyState;
  const frame = {
    refreshing: isFetching && !loading, asOf, onBackToToday: callbacks.onBackToToday,
    banners: { restoreError, dismissError, dismissNotice },
  };

  if (scope) {
    return (
      <PageFrame {...frame}>
        <ScopedFindings scope={scope} dims={visibleDimensions} projectName={projectName} dateLabel={asOf?.day || null} readOnly={Boolean(asOf)}
          onDismissFinding={actions.onDismiss} />
      </PageFrame>
    );
  }
  return (
    <PageFrame {...frame}>
      <ViolationsHeader summary={summary} selectedSource={selectedSource} dismissedCount={shownDismissedCount({ asOf, dismissed, dismissedLoading })} />
      {/* The header paints on the click; the workbench (every finding,
          flattened and filtered) follows in the next commit. */}
      <DeferredMount fallback={<CardListSkeleton />}>
        <FindingsWorkbench dims={visibleDimensions} dismissed={dismissed} dismissedLoading={dismissedLoading} workbench={workbench}
          onWorkbenchChange={onWorkbenchChange} actions={actions} />
      </DeferredMount>
    </PageFrame>
  );
}
