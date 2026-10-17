import { useMemo } from 'react';
import RunHead from './RunHead.jsx';
import DimensionCardsGrid from './DimensionCardsGrid.jsx';
import OverviewSkeleton, { SkeletonBottom } from './OverviewSkeleton.jsx';
import SinceStrip from '../../../components/SinceStrip.jsx';
import FixFirstPanel from '../../../components/FixFirstPanel.jsx';
import WherePanel, { WHERE, WHERE_PAGE } from '../../../components/WherePanel.jsx';
import { useWhereView } from '../../../components/useWhereView.js';
import FindingsByFolderPanel from '../../../components/FindingsByFolderPanel.jsx';
import OffendingFilesSection from '../../../components/OffendingFilesSection.jsx';
import RunChangeFooter from '../../../components/RunChangeFooter.jsx';
import { SectionLabel } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import { withPending } from '../../../utils/pendingClass.js';
import { nameKey } from '../../../utils/nameKey.js';
import { buildRunViewData } from '../runViewData.js';
import { weakestDimensionFirst } from '../overviewHeadModel.js';
import { makeCardNavigate, makeFindingsNavigate } from '../overviewNavigate.js';
import { useRunReportSpecs } from './runReportSpecs.jsx';
import { useRunFindings } from '../hooks/useRunFindings.js';
import { useRunComparison } from '../hooks/useRunComparison.js';
import { runAsOf } from '../../violations/asOf.js';

// Areas exist only for today (the Map measures the latest findings): a run shows its folders and files.
const RUN_WHERE_VIEWS = Object.freeze([WHERE.FOLDERS, WHERE.FILES]);

/** The run's dimensions as the Overview's compact cards, weakest first, each with what the run changed in it. */
function RunDimensionsSection({ sorted, dimTrends, footerFor, onDimensionClick }) {
  return (
    <section className="quality-dimensions" aria-label={t('overview.qualityDimensionsAria')}>
      <div className="quality-dimensions__head">
        <SectionLabel>{t('overview.qualityDimensionsLabel')} · {sorted.length}</SectionLabel>
      </div>
      <div className="dimensions-panel">
        <DimensionCardsGrid sortedDimensions={sorted} onDimensionClick={onDimensionClick} dimTrends={dimTrends} compact fill footerFor={footerFor} />
      </div>
    </section>
  );
}

/** Fix first beside where the findings are, the run's folders or files; the skeleton while its findings load. */
function RunBottom({ dimensions, topFiles, loading, opens }) {
  const [where, setWhere] = useWhereView(WHERE_PAGE.RUN, WHERE.FOLDERS, RUN_WHERE_VIEWS);
  if (loading) return <SkeletonBottom run />;
  return (
    <div className="explorer-bottom">
      <FixFirstPanel dimensions={dimensions} onRequirementClick={opens.requirement} />
      <WherePanel view={where} onView={setWhere} views={RUN_WHERE_VIEWS}>
        {where === WHERE.FOLDERS && <FindingsByFolderPanel dimensions={dimensions} onFolderClick={opens.folder} />}
        {where === WHERE.FILES && <OffendingFilesSection topFiles={topFiles} onFileClick={opens.file} />}
      </WherePanel>
    </div>
  );
}

/**
 * A card's footer: what the run changed in the dimension, "not compared"
 * when the run was not; none (the pass rate shows) until that is known.
 */
function runFooter({ settled, compared, change }) {
  if (!settled || (compared && !change)) return undefined;
  return (item) => <RunChangeFooter change={change?.perDim[nameKey(item.dimension)] ?? null} />;
}

/**
 * The run's findings and what opens them: the finding lists (the run's
 * scores, merged into the dashboard's dimensions), the worst files, and
 * every finding view as a scoped Findings view as of the run, read-only.
 * Also registers the run's report specs.
 */
function useRunOverviewModel({ dashboard, selectedRunId, selectedProject, selectedSource, availableRuns, projectName, onNavigate }) {
  const runId = dashboard?.selectedRun?.runId || selectedRunId;
  const findings = useRunFindings({ project: selectedProject, runId, source: selectedSource, availableRuns, enabled: !!dashboard?.dimensions });
  const { dimensions, runSummary, since, runTopFiles, headline } = useMemo(
    () => buildRunViewData(dashboard, findings.dimensions),
    [dashboard, findings.dimensions],
  );
  const asOf = useMemo(() => runAsOf(runId, dashboard?.selectedRun?.dateISO), [runId, dashboard?.selectedRun?.dateISO]);
  const opens = useMemo(() => ({ card: makeCardNavigate({ onNavigate, asOf }), ...makeFindingsNavigate({ onNavigate, asOf }) }), [onNavigate, asOf]);
  const reportDashboard = useMemo(() => (dashboard ? { ...dashboard, dimensions } : dashboard), [dashboard, dimensions]);
  useRunReportSpecs({ dashboard: reportDashboard, runSummary, selectedRunId, projectName, headline, since });
  return { runId, dimensions, runTopFiles, opens, findingsLoading: findings.isLoading };
}

/**
 * The run page (History, "open run"), the Overview for one run: its header
 * (FindingsHead) with the changes since the run it was compared with, the
 * since line, its dimensions as compact cards weakest first with what the
 * run changed in each, then Fix first beside its folders or files. Every
 * finding view opens as of the run, read-only; a card or a mover opens the
 * dimension as of the run. The Overview's skeleton until the run lands.
 */
export default function RunOverviewPanel({
  dashboard, selectedRunId, selectedProject, selectedSource, availableRuns, projectName, projectInfo = null,
  onDimensionClick, onNavigate, refreshing = false, formulaUpdated = false,
}) {
  const model = useRunOverviewModel({ dashboard, selectedRunId, selectedProject, selectedSource, availableRuns, projectName, onNavigate });
  const comparison = useRunComparison({ project: selectedProject, source: selectedSource, runId: model.runId, dimensions: dashboard?.dimensions });
  const sorted = useMemo(() => [...(dashboard?.dimensions || [])].sort(weakestDimensionFirst), [dashboard]);
  if (!dashboard?.dimensions) return <OverviewSkeleton run projectName={projectName} />;
  const openDimension = onDimensionClick ? (item) => onDimensionClick(item, model.runId) : undefined;
  return (
    <div className={withPending('run-page', refreshing)} aria-busy={refreshing || undefined}>
      <RunHead dashboard={dashboard} comparison={comparison} projectInfo={projectInfo} source={selectedSource}
        formulaUpdated={formulaUpdated} onCardNavigate={model.opens.card}
        since={<SinceStrip summary={comparison.change?.since ?? null} label={t('overview.sincePreviousRun')}
          emptyNote={comparison.settled && !comparison.compared ? t('history.noBaseline') : null} />} />
      <RunDimensionsSection sorted={sorted} dimTrends={comparison.dimTrends} footerFor={runFooter(comparison)} onDimensionClick={openDimension} />
      <RunBottom dimensions={model.dimensions} topFiles={model.runTopFiles} loading={model.findingsLoading} opens={model.opens} />
    </div>
  );
}
