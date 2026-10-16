import IncompleteSetupCard from './IncompleteSetupCard.jsx';
import OverviewSkeleton from './OverviewSkeleton.jsx';
import { recallShape } from '../overviewShape.js';
import { t } from '../../../strings/index.js';
import DashboardContent from './DashboardContent.jsx';
import { dashboardPageClassName } from './dashboardGate.jsx';

// The ready-state render of DashboardPage. A plain function, not a component,
// for the same reason the gate ladder is: the .dashboard-page node's identity
// across branch transitions is test-pinned (DashboardPage.fadeOnceIdentity),
// and it only survives while every branch returns its tree from the one
// position in DashboardPage's render.

function renderReadyContent({ data, callbacks, runMode, projectInfo, selectedRunId, accumulatedDimensions, focus, handlers, refreshing }) {
  const { dashboard, accumulated, availableRuns = [], dailyRuns, overviewRunIndex = 0, selectedProject, granularity = 'day', selectedSource, scoresPending = false, customFormula = false, formulaUpdated = false, onGranularityChange } = data;
  const { onRunSelect, onRunHover, onRunHoverEnd, onNavigate } = callbacks;
  return (
    <DashboardContent
      runMode={runMode}
      data={{ dashboard, selectedRunId, accumulated, accumulatedDimensions, availableRuns, dailyRuns, overviewRunIndex, selectedProject, projectInfo, granularity, selectedSource, scoresPending, customFormula, formulaUpdated, refreshing }}
      focus={focus}
      callbacks={{ onRunSelect, onRunHover, onRunHoverEnd, onDimensionCardClick: handlers.handleDimensionCardClick, onAccumulatedDimensionClick: handlers.handleAccumulatedDimensionClick, onNavigate, onGranularityChange }}
    />
  );
}

/**
 * @param {object} ctx
 * @param {object} ctx.data dashboard state slice (dashboard, error, isFetching,
 *   accumulated, availableRuns, dailyRuns, overviewRunIndex,
 *   selectedProject, granularity, selectedSource, scoresPending, customFormula)
 * @param {object} ctx.callbacks passed through to DashboardContent (onRunSelect,
 *   onNavigate, onGranularityChange)
 * @param {boolean} ctx.runMode
 * @param {object|null} ctx.projectInfo
 * @param {string} ctx.projectName
 * @param {object} ctx.pageState from useDashboardPageState (contentReady,
 *   isLoading, showOverviewSkeleton, dashboardAppearClass)
 * @param {object} ctx.focus current focused dimension (dimension, setDimension,
 *   dimensionData)
 * @param {object} ctx.handlers click handlers from useDashboardHandlers
 *   (handleDimensionCardClick, handleAccumulatedDimensionClick)
 * @param {Array} ctx.accumulatedDimensions pre-rescored accumulated dimensions
 * @param {string} [ctx.selectedRunId]
 * @param {() => void} ctx.onSetupComplete
 */
export function renderDashboardBody(ctx) {
  const { data, runMode, projectInfo, projectName, pageState, onSetupComplete } = ctx;
  const { dashboard, error, isFetching } = data;
  const { contentReady, isLoading, showOverviewSkeleton, dashboardAppearClass } = pageState;
  // True while a *background* fetch is running but we're already showing
  // data (placeholderData kept the previous run on screen during a switch).
  // Each section mutes its text (see section-pending in dashboard.css);
  // the loading line itself lives on the top bar. The page never dims.
  const isRefreshing = isFetching && !!dashboard && !isLoading;
  // showOverviewSkeleton comes from useDashboardPageState (beside the appear
  // latch, which needs it too) -- from the user's perspective this covers both
  // loader windows as one continuous OverviewSkeleton, no handoff between them.
  // A runMode load (the run page) shows the same skeleton in the run page's
  // footprint. The skeleton IS the content (nothing stale is underneath it),
  // so the page never dims.
  const showRunSkeleton = isLoading && runMode;
  return (
    <>
      {/* The sibling slot the gate frames hold with {null} (see gateFrame):
          keeps .dashboard-page at child index 1 in every branch. */}
      {null}
      <div className={dashboardPageClassName({ appearClass: dashboardAppearClass })}>
        <IncompleteSetupCard projectInfo={projectInfo} onComplete={onSetupComplete} />
        {error && <p className="inline-error">{t('overview.loadFailed')}</p>}
        {showOverviewSkeleton && <OverviewSkeleton projectName={projectName} lastKnown={data.lastKnown} shape={recallShape(data.selectedProject)} />}
        {showRunSkeleton && <OverviewSkeleton run projectName={projectName} />}
        {/* No runMode equivalent of the Overview's grace-fallback loader: in
            runMode contentReady is `!!dashboard`, so the instant dashboard lands
            contentReady is already true -- there's no window where dashboard is
            in but content isn't ready yet. The run skeleton above is the only
            loader runMode needs (the run page shows it again itself until the
            run's dimensions land). */}
        {dashboard && contentReady && renderReadyContent({ ...ctx, refreshing: isRefreshing })}
      </div>
    </>
  );
}
