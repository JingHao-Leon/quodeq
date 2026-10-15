import { useMemo, useState, lazy, Suspense } from 'react';
import DimensionCardsGrid from './DimensionCardsGrid.jsx';
import RunHistoryPanelPlaceholder from './RunHistoryPanelPlaceholder.jsx';
import OverviewHead from './OverviewHead.jsx';
import OffendingFilesSection from '../../../components/OffendingFilesSection.jsx';
import FindingsByFolderPanel from '../../../components/FindingsByFolderPanel.jsx';
import FixFirstPanel from '../../../components/FixFirstPanel.jsx';
import WherePanel, { WHERE } from '../../../components/WherePanel.jsx';
import SinceStrip from '../../../components/SinceStrip.jsx';
import RadialPanel from '../../../components/radial/RadialPanel.jsx';
import RiskAreasPanel from '../../map/components/RiskAreasPanel.jsx';
import { riskMapParams } from '../../map/model/riskLinks.js';
import { buildTopOffendingFiles } from '../../../utils/explorerUtils.js';
import { withDimensionsStr } from '../../../utils/dimensionUtils.js';
import { SectionLabel } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import { DEFAULT_SCORE_HISTORY_GRANULARITY } from '../../../constants.js';
import { buildHeadline, filterSinceBaseline, periodChipDeltas, sumSinceBaseline } from '../headlineStats.js';
import { useAccumulatedComputations, computeAccumulatedStats } from '../hooks/useAccumulatedComputations.js';
import { usePreviousPeriodMetrics, useOverviewSince } from '../hooks/useOverviewPeriod.js';
import { weakestDimensionFirst, dimensionPoints, overviewPastRun } from '../overviewHeadModel.js';
import { useAccumulatedReportSpec } from './accumulatedReportSpecs.jsx';
import { NAV_TAB } from '../../../vocab/navTab.js';
import { withPending } from '../../../utils/pendingClass.js';
import { makeCardNavigate, makeFindingsNavigate } from '../overviewNavigate.js';
import { overviewAsOf } from '../overviewAsOf.js';
import { nameKey } from '../../../utils/nameKey.js';

const runHistoryPanelImport = () => import('./RunHistoryPanel.jsx');
const RunHistoryPanel = lazy(runHistoryPanelImport);

// Warm the chart chunk before the overview first mounts with data (called
// from DashboardPage while the boot loader / skeleton is still up). The
// dynamic import caches, so the lazy() above resolves without ever
// committing its RunHistoryPanelPlaceholder fallback -- otherwise a cold
// boot pays a placeholder beat inside otherwise-real content.
export function preloadRunHistoryPanel() {
  runHistoryPanelImport().catch((err) => {
    console.warn('[AccumulatedOverviewPanel] chart chunk preload failed:', err);
  });
}

export { useAccumulatedComputations, computeAccumulatedStats };


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** The dimensions as compact cards, weakest first, each lit with its radial point. */
function AccumulatedDimensionsSection({ sortedDimensions, onDimensionClick, selectedDayDimNames, dimTrends, pending, notEvaluated, onEvaluate, lit }) {
  return (
    <section
      className={withPending('quality-dimensions', pending)}
      aria-label={t('overview.qualityDimensionsAria')}
      aria-busy={pending || undefined}
    >
      <div className="quality-dimensions__head">
        <SectionLabel>{t('overview.qualityDimensionsLabel')} · {sortedDimensions.length}</SectionLabel>
        {pending && <span className="quality-dimensions__pending">{t('overview.updating')}</span>}
      </div>
      <div className="dimensions-panel">
        <DimensionCardsGrid
          sortedDimensions={sortedDimensions}
          onDimensionClick={onDimensionClick}
          selectedDayDimNames={selectedDayDimNames}
          dimTrends={dimTrends}
          notEvaluated={notEvaluated}
          onEvaluate={onEvaluate}
          compact
          lit={lit}
        />
      </div>
    </section>
  );
}

/** The score history (grade bands and change marks, as the dimension page's) beside the dimensions radial. */
function OverviewTopGrid({ chart, sorted, lit, onDimensionClick, pending }) {
  const onPoint = onDimensionClick ? (name) => { const d = sorted.find((x) => x.dimension === name); if (d) onDimensionClick(d); } : undefined;
  return (
    <div className={withPending('qd-top-grid overview-top-grid', pending)} aria-busy={pending || undefined}>
      <Suspense fallback={<RunHistoryPanelPlaceholder />}>
        {chart.mountable && (
          <RunHistoryPanel
            trend={chart.trend}
            selectedRunId={chart.selectedRunId}
            onBarClick={chart.onRunClick}
            onBarHover={chart.onRunHover}
            onBarHoverEnd={chart.onRunHoverEnd}
            granularity={chart.granularity}
            onGranularityChange={chart.onGranularityChange}
          />
        )}
      </Suspense>
      <RadialPanel radialPrinciples={dimensionPoints(sorted)} label={t('overview.dimensionsRadialLabel')} ariaLabel={t('overview.dimensionsRadialAria')}
        onPrincipleClick={onPoint} highlighted={lit.name} onHover={lit.setName} />
    </div>
  );
}

/** What to fix beside where it is: Fix first on the left, the areas, folders or files on the right (areas first). */
function OverviewBottom({ data, filteredDimensions, topFiles, pending, opens, onNavigate }) {
  const [where, setWhere] = useState(WHERE.AREAS);
  const openMap = onNavigate ? (params) => onNavigate(NAV_TAB.MAP, params) : null;
  return (
    <div className="explorer-bottom">
      <FixFirstPanel dimensions={filteredDimensions} onRequirementClick={opens.requirement} />
      <WherePanel view={where} onView={setWhere}>
        {where === WHERE.AREAS && (
          <RiskAreasPanel project={data.selectedProject} source={data.selectedSource} onAreaFindings={opens.area}
            onAreaInMap={openMap ? (area) => openMap(riskMapParams({ area: area.name })) : undefined}
            onOpenRisk={openMap ? () => openMap(riskMapParams()) : undefined} />
        )}
        {where === WHERE.FOLDERS && (
          <FindingsByFolderPanel dimensions={filteredDimensions} onFolderClick={opens.folder} onOpenMap={openMap ? () => openMap() : undefined} />
        )}
        {where === WHERE.FILES && <OffendingFilesSection topFiles={topFiles} pending={pending} onFileClick={opens.file} />}
      </WherePanel>
    </div>
  );
}

/**
 * What the Overview compares and lights: the dimensions weakest first, the
 * one lit by a card or the radial, the previous period's numbers and the
 * since line, and the note on a past run.
 */
function useOverviewView({ data, filteredStats, filteredDimensions, filteredPeriodTrend, currentOverviewRun, asOf, onRunClick }) {
  const [litName, setLitName] = useState(null);
  const lit = useMemo(() => ({ name: litName, setName: setLitName }), [litName]);
  const sorted = useMemo(() => [...(filteredStats.sorted || [])].sort(weakestDimensionFirst), [filteredStats.sorted]);
  const visibleNames = useMemo(() => new Set((filteredDimensions || []).map((d) => nameKey(d.dimension))), [filteredDimensions]);
  const period = { project: data.selectedProject, source: data.selectedSource, periodTrend: filteredPeriodTrend, runOnShow: currentOverviewRun };
  const previous = usePreviousPeriodMetrics({ ...period, visibleNames });
  const since = useOverviewSince({ ...period, dimensions: filteredDimensions });
  const pastRun = overviewPastRun(asOf, data.availableRuns, onRunClick, data.trend || filteredPeriodTrend);
  return { lit, sorted, previous, since, pastRun };
}

function AccumulatedOverviewSections({
  data, callbacks, currentOverviewRun, selectedDayDimNames, filteredPeriodTrend, filteredDimensions,
  filteredAccumulated, filteredStats, chartMountable, dimTrends, topFiles, onCardNavigate, headline, notEvaluated, asOf,
}) {
  const { onRunClick, onRunHover, onRunHoverEnd, onDimensionClick, onNavigate } = callbacks;
  const opens = useMemo(() => makeFindingsNavigate({ onNavigate, asOf }), [onNavigate, asOf]);
  const onEvaluate = onNavigate ? () => onNavigate(NAV_TAB.EVALUATE) : undefined;
  const view = useOverviewView({ data, filteredStats, filteredDimensions, filteredPeriodTrend, currentOverviewRun, asOf, onRunClick });
  const granularity = data.granularity || DEFAULT_SCORE_HISTORY_GRANULARITY;
  const chart = {
    mountable: chartMountable, trend: filteredPeriodTrend, selectedRunId: currentOverviewRun,
    onRunClick, onRunHover, onRunHoverEnd, granularity, onGranularityChange: callbacks.onGranularityChange,
  };
  // A run or date switch refetches the dashboard and the scores; every
  // section shows the previous values, muted, meanwhile.
  const pending = !!(data.scoresPending || data.refreshing);
  return (
    <>
      <OverviewHead data={data} accumulated={filteredAccumulated} stats={filteredStats} headline={headline} previous={view.previous}
        deltas={periodChipDeltas(filteredPeriodTrend, currentOverviewRun)} pastRun={view.pastRun} onCardNavigate={onCardNavigate}
        since={<SinceStrip summary={view.since} granularity={granularity} />} />

      <AccumulatedDimensionsSection
        sortedDimensions={view.sorted}
        onDimensionClick={onDimensionClick}
        selectedDayDimNames={selectedDayDimNames}
        dimTrends={dimTrends}
        pending={pending}
        notEvaluated={notEvaluated}
        onEvaluate={onEvaluate}
        lit={view.lit}
      />

      <OverviewTopGrid chart={chart} sorted={view.sorted} lit={view.lit} onDimensionClick={onDimensionClick} pending={pending} />

      <OverviewBottom data={data} filteredDimensions={filteredDimensions} topFiles={topFiles} pending={pending} opens={opens} onNavigate={onNavigate} />
    </>
  );
}

export default function AccumulatedOverviewPanel({ data, callbacks }) {
  const { onNavigate } = callbacks;
  const { currentOverviewRun, selectedDayDimNames, filteredPeriodTrend, filteredDimensions, filteredAccumulated, filteredStats, chartMountable, dimTrends, visibleSet } = useAccumulatedComputations(data);
  // Standards switched on but never evaluated: shown as empty cards.
  const notEvaluated = useMemo(() => {
    const evaluated = new Set((data.accumulatedDimensions || []).map((d) => (d.dimension || '').toLowerCase()));
    return [...(visibleSet || [])].filter((id) => !evaluated.has(id));
  }, [visibleSet, data.accumulatedDimensions]);

  const topFiles = useMemo(
    () => withDimensionsStr(buildTopOffendingFiles(filteredDimensions || [])),
    [filteredDimensions]
  );

  // Only the dimensions on show: a hidden standard must not move the report.
  // (The header's severities take their deltas from the period trend instead,
  // so they follow the chart's grouping like the score arrow; see periodChipDeltas.)
  const since = useMemo(
    () => sumSinceBaseline(filterSinceBaseline(data.sinceBaseline, (filteredDimensions || []).map((d) => d.dimension))),
    [data.sinceBaseline, filteredDimensions],
  );
  const headline = useMemo(() => buildHeadline(filteredAccumulated?.dimensions), [filteredAccumulated]);
  useAccumulatedReportSpec({ data, filteredAccumulated, filteredDimensions, headline, since });

  const asOf = useMemo(() => overviewAsOf(data.selectedRunId, data.availableRuns), [data.selectedRunId, data.availableRuns]);
  const onCardNavigate = useMemo(() => makeCardNavigate({ onNavigate, asOf }), [onNavigate, asOf]);

  return (
    <AccumulatedOverviewSections
      data={data} callbacks={callbacks} currentOverviewRun={currentOverviewRun}
      selectedDayDimNames={selectedDayDimNames} filteredPeriodTrend={filteredPeriodTrend}
      filteredDimensions={filteredDimensions} filteredAccumulated={filteredAccumulated}
      filteredStats={filteredStats} chartMountable={chartMountable} dimTrends={dimTrends}
      topFiles={topFiles} onCardNavigate={onCardNavigate} headline={headline}
      notEvaluated={notEvaluated} asOf={asOf}
    />
  );
}
