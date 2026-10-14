import { useMemo, useState, useEffect } from 'react';
import TopOffendingFilesTable, { OffendingFilesHead } from '../../dashboard/components/TopOffendingFilesTable.jsx';
import { buildProjectRootFile } from '../../../utils/explorerUtils.js';
import { useExplorerData, buildEvalPrincipalFn } from './explorerDataHooks.js';
import { useStandardDescriptions } from '../hooks/useStandardDescriptions.js';
import { TermHeader, SectionLabel } from '../../../components/terminal/index.js';
import LoadingScreen from '../../../components/LoadingScreen.jsx';
import DeferredMount from '../../../components/DeferredMount.jsx';
import CardListSkeleton from '../../../components/CardListSkeleton.jsx';
import PrinciplesCardsRow from './PrinciplesCardsRow.jsx';
import DimensionScoreHistoryPanel from './DimensionScoreHistoryPanel.jsx';
import FindingsHead from '../../../components/FindingsHead.jsx';
import { scopeMetrics } from '../../../models/findingMetrics.js';
import { GRADE } from '../../../vocab/grade.js';
import { HERO_CARD_KIND } from '../../../vocab/heroCardKind.js';
import ExplorerRadialPanel from './ExplorerRadialPanel.jsx';
import { useExplorerPageSpecs } from './useExplorerPageSpecs.jsx';
import { buildRadialPrinciples, buildEnrichedPrinciples } from './explorerPrincipleView.js';
import { t } from '../../../strings/index.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import TrendBadge from '../../../components/TrendBadge.jsx';
import { useExplorerTrend } from './useExplorerTrend.js';
import { dimensionPeriodDeltas } from '../dimensionPeriodDeltas.js';
import { buildExplorerFindingsNav } from './explorerFindingsNav.js';

/** Empty/loading/error states, checked in order — extracted so the main
 * render stays a single happy-path return. The loading state keeps the
 * page frame (header with the dimension name) and puts the loader inline,
 * so the navigation paints as this page, not as a blank screen. */
function explorerPageStatus(d, dimension) {
  if (d.loading) {
    return (
      <div className="explorer-page">
        <TermHeader name={String(dimension || '').toLowerCase()} />
        <LoadingScreen variant="inline" />
      </div>
    );
  }
  if (d.error) return <div className="inline-error">{t('explorer.loadFailed')}</div>;
  if (d.waiting) {
    // 202 from the backend: the run exists but this dimension's report
    // isn't written (still running, or the run stopped before reaching it).
    // Rendering it as data would show SCORE — / 0 violations and read as a
    // clean pass.
    return (
      <div className="empty-state">
        <h2>{t('explorer.reportNotReadyTitle')}</h2>
        <p>{t('explorer.reportNotReadyBody')}</p>
      </div>
    );
  }
  if (!d.evalData) return <div className="empty-state"><h2>{t('explorer.noDataFound')}</h2></div>;
  return null;
}

/**
 * The fetched data + the local run/date override. Local state lets the
 * score-history bar click swap which run is shown without pushing a new
 * entry onto the nav stack (avoids the "security / security / security ..."
 * breadcrumb pile-up). The props are the source of truth when the user
 * navigates here from elsewhere; local state takes over once the user
 * starts clicking bars.
 */
function useExplorerPageData({ project, dimension, runId, dateLabel, refreshSignal, selectedSource }) {
  const [activeRunId, setActiveRunId] = useState(runId);
  const [activeDateLabel, setActiveDateLabel] = useState(dateLabel);
  useEffect(() => { setActiveRunId(runId); }, [runId]);
  useEffect(() => { setActiveDateLabel(dateLabel); }, [dateLabel]);
  const d = useExplorerData(project, dimension, activeRunId, refreshSignal, selectedSource);
  const { standardDescription } = useStandardDescriptions(dimension);

  const buildEvalPrincipal = useMemo(
    () => d.evalData ? buildEvalPrincipalFn(d.evalData, d.complianceByPrinciple, project, activeRunId, activeDateLabel) : () => ({}),
    [d.evalData, d.complianceByPrinciple, project, activeRunId, activeDateLabel]
  );

  // Both builds walk every violation and compliance item; they only depend
  // on the fetched data, not on granularity or the selected history bar.
  const { evalData, allViolations, complianceByPrinciple, principleGrades } = d;
  const dimFile = useMemo(
    () => (evalData ? buildDimensionRootFile(evalData, allViolations, complianceByPrinciple) : null),
    [evalData, allViolations, complianceByPrinciple],
  );
  const principleViews = useMemo(() => ({
    radialPrinciples: buildRadialPrinciples(principleGrades),
    enrichedPrinciples: buildEnrichedPrinciples(principleGrades, allViolations, complianceByPrinciple),
  }), [principleGrades, allViolations, complianceByPrinciple]);

  return {
    d, standardDescription, activeRunId, setActiveRunId, activeDateLabel, setActiveDateLabel,
    buildEvalPrincipal, dimFile, principleViews,
  };
}

/**
 * The synthetic dimension-root file a cross-project explorer's VIOLATIONS /
 * COMPLIANCE cards (and severity badges) navigate into a FileDetailPage
 * with (see explorerFindingsNav.js). fromProject rides along so a file
 * opened from a cross-project explorer dismisses into ITS project, not the
 * global selection.
 */
function buildDimensionRootFile(evalData, allViolations, complianceByPrinciple) {
  const allCompliance = [];
  if (complianceByPrinciple) {
    for (const items of complianceByPrinciple.values()) allCompliance.push(...items);
  }
  return buildProjectRootFile(
    [{ dimension: evalData.dimension, violations: allViolations, compliance: allCompliance }],
    evalData.dimension,
  );
}

/** Top grid: the score history beside the principles radial. */
function ExplorerTopGrid({ d, trend, granularity, onGranularityChange, setActiveRunId, setActiveDateLabel, activeRunId, radialPrinciples, onPrincipleClick }) {
  return (
    <div className="qd-top-grid explorer-top-grid">
      <DimensionScoreHistoryPanel
        trend={trend} dimension={d.evalData.dimension} selectedRunId={activeRunId}
        granularity={granularity} onGranularityChange={onGranularityChange}
        onBarClick={(point) => { setActiveRunId(point.runId); setActiveDateLabel(point.dateLabel); }}
      />
      <ExplorerRadialPanel radialPrinciples={radialPrinciples} onPrincipleClick={onPrincipleClick} />
    </div>
  );
}

/**
 * The dimension's header: its score ring and trend, its description, and
 * its numbers (violations, pass rate, per 100 files read, critical per
 * 1,000, Risk zone), the violations and pass rate opening their findings.
 */
function ExplorerHead({ dim, d, overallScoreNum, standardDescription, activeDateLabel, activeRunId, periodDeltas, actions, filesRead: borrowedFilesRead }) {
  const filesRead = d.evalData.filesRead ?? borrowedFilesRead ?? 0;
  const metrics = scopeMetrics({ sevCounts: d.severityCounts || {}, total: d.allViolations.length, compliance: d.totalCompliant, files: filesRead });
  return (
    <FindingsHead
      title={dim} sub={activeDateLabel || activeRunId || null} description={standardDescription}
      grade={{ score: overallScoreNum, insufficient: d.overallGrade?.grade === GRADE.INSUFFICIENT, hint: null }}
      badge={periodDeltas.score !== null ? <TrendBadge delta={periodDeltas.score} /> : null}
      metrics={metrics} filesHint={t('violations.scopeStatFilesRead', { count: filesRead })} deltas={periodDeltas.chips} actions={actions}
    />
  );
}

/** The principle cards, each opening its principle. */
function PrinciplesPanel({ radialPrinciples, enrichedPrinciples, onPrincipleClick }) {
  return (
    <section className="qd-cards-panel" aria-label={t('explorer.principlesAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('explorer.principlesLabel')} · {radialPrinciples.length}</SectionLabel>
      </div>
      <PrinciplesCardsRow principles={enrichedPrinciples} onPrincipleClick={onPrincipleClick} />
    </section>
  );
}

/** The files with the most violations, each opening its file. */
function OffendingFilesPanel({ topFiles, onFileClick }) {
  return (
    <section className="qd-cards-panel offending-panel" aria-label={t('overview.violationsByFileAria')}>
      <OffendingFilesHead count={topFiles.length} />
      <TopOffendingFilesTable files={topFiles} onFileClick={onFileClick} />
    </section>
  );
}

/** The happy-path render: header, principle cards, top grid (score
 * history + radial), and the top-offending-files table. */
function ExplorerPageBody({
  isRefreshing, dim, standardDescription, activeDateLabel, activeRunId, overallScoreNum, d,
  findingsNav, headActions, trend, granularity, onGranularityChange,
  setActiveRunId, setActiveDateLabel, radialPrinciples, enrichedPrinciples, filesRead,
}) {
  // The arrows on the title, the score and the chips: this dimension's
  // change since the previous period of the chart's grouping, as of the
  // run on show, the way the Overview's cards and hero read.
  const periodDeltas = useMemo(
    () => dimensionPeriodDeltas(trend, dim, granularity, activeRunId),
    [trend, dim, granularity, activeRunId],
  );
  return (
    <div className={`explorer-page dashboard-fade${isRefreshing ? ' section-pending' : ''}`}>
      <ExplorerHead
        dim={dim} d={d} overallScoreNum={overallScoreNum} standardDescription={standardDescription}
        activeDateLabel={activeDateLabel} activeRunId={activeRunId} periodDeltas={periodDeltas}
        actions={headActions} filesRead={filesRead}
      />

      {/* The header paints first; the card row and the files table are the
          heavy part and follow in the next commit. */}
      <DeferredMount fallback={<CardListSkeleton />}>
        <PrinciplesPanel radialPrinciples={radialPrinciples} enrichedPrinciples={enrichedPrinciples} onPrincipleClick={findingsNav.onPrincipleClick} />
      </DeferredMount>

      <ExplorerTopGrid
        d={d} trend={trend} granularity={granularity} onGranularityChange={onGranularityChange}
        setActiveRunId={setActiveRunId} setActiveDateLabel={setActiveDateLabel}
        activeRunId={activeRunId} radialPrinciples={radialPrinciples} onPrincipleClick={findingsNav.onPrincipleClick}
      />

      <DeferredMount fallback={<CardListSkeleton />}>
        <OffendingFilesPanel topFiles={d.topFiles} onFileClick={findingsNav.onFileClick} />
      </DeferredMount>
    </div>
  );
}

/** The header's tiles and severity badges open what the old stat cards opened. */
function headActionsOf(findingsNav) {
  return {
    onViolations: () => findingsNav.handleCardNavigate(HERO_CARD_KIND.VIOLATIONS),
    onCompliance: () => findingsNav.handleCardNavigate(HERO_CARD_KIND.COMPLIANCE),
    onSeverity: (level) => findingsNav.onSeverityBadge(level)(),
  };
}

/** The values derived from `d` once it's known to be ready (dim label,
 * radial/enriched principle views, score, refreshing flag). */
function buildExplorerViewData(d, principleViews) {
  return {
    dim: String(d.evalData.dimension || '').toLowerCase(),
    radialPrinciples: principleViews.radialPrinciples,
    enrichedPrinciples: principleViews.enrichedPrinciples,
    overallScoreNum: parseFloat(d.overallGrade?.score),
    isRefreshing: d.isFetching && !!d.evalData,
  };
}

export default function ExplorerPage({
  project,
  dimension,
  runId,
  dateLabel,
  sourceTab,
  selectedSource = PROJECT_SOURCE.LOCAL,
  onNavigate,
  refreshSignal,
  trend: borrowedTrend = [],
  granularity = 'day',
  onGranularityChange,
  scopedFindings = null,
  filesRead = null,
}) {
  const trend = useExplorerTrend(project, selectedSource, borrowedTrend);
  const {
    d, standardDescription, activeRunId, setActiveRunId, activeDateLabel, setActiveDateLabel,
    buildEvalPrincipal, dimFile, principleViews,
  } = useExplorerPageData({ project, dimension, runId, dateLabel, refreshSignal, selectedSource });

  useExplorerPageSpecs({
    evalData: d.evalData, principleGrades: d.principleGrades, allViolations: d.allViolations,
    overallGrade: d.overallGrade, activeDateLabel, activeRunId,
  });

  const status = explorerPageStatus(d, dimension);
  if (status) return status;

  // Thread sourceTab through: without it a principle page opened from a
  // Violations-tab drill-in falls back to the Overview tab.
  const findingsNav = buildExplorerFindingsNav({
    dimension, scoped: scopedFindings, dimFile, onNavigate, project, activeRunId, activeDateLabel, sourceTab, trend, buildEvalPrincipal,
  });
  const { dim, radialPrinciples, enrichedPrinciples, overallScoreNum, isRefreshing } = buildExplorerViewData(d, principleViews);

  return (
    <ExplorerPageBody
      isRefreshing={isRefreshing} dim={dim} standardDescription={standardDescription}
      activeDateLabel={activeDateLabel} activeRunId={activeRunId} overallScoreNum={overallScoreNum} d={d}
      findingsNav={findingsNav} headActions={onNavigate ? headActionsOf(findingsNav) : {}}
      trend={trend} granularity={granularity} onGranularityChange={onGranularityChange}
      setActiveRunId={setActiveRunId} setActiveDateLabel={setActiveDateLabel}
      radialPrinciples={radialPrinciples} enrichedPrinciples={enrichedPrinciples} filesRead={filesRead}
    />
  );
}
