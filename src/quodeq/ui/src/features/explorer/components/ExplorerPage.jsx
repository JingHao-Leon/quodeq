import { useMemo, useState, useEffect } from 'react';
import TopOffendingFilesTable from '../../dashboard/components/TopOffendingFilesTable.jsx';
import { buildProjectRootFile } from '../../../utils/explorerUtils.js';
import { useExplorerData, buildEvalPrincipalFn } from './explorerDataHooks.js';
import { useStandardDescriptions } from '../hooks/useStandardDescriptions.js';
import { TermHeader, SectionLabel } from '../../../components/terminal/index.js';
import LoadingScreen from '../../../components/LoadingScreen.jsx';
import DeferredMount from '../../../components/DeferredMount.jsx';
import CardListSkeleton from '../../../components/CardListSkeleton.jsx';
import PrinciplesCardsRow from './PrinciplesCardsRow.jsx';
import DimensionScoreHistoryPanel from './DimensionScoreHistoryPanel.jsx';
import FindingsHead from '../../violations/scope/FindingsHead.jsx';
import { scopeMetrics } from '../../violations/scope/scopeMetrics.js';
import { GRADE } from '../../../vocab/grade.js';
import { HERO_CARD_KIND } from '../../dashboard/dashboardVocab.js';
import ExplorerRadialPanel from './ExplorerRadialPanel.jsx';
import { useExplorerPageSpecs } from './useExplorerPageSpecs.jsx';
import { buildRadialPrinciples, buildEnrichedPrinciples } from './explorerPrincipleView.js';
import { t } from '../../../strings/index.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import TrendBadge from '../../../components/TrendBadge.jsx';
import { useExplorerTrend } from './useExplorerTrend.js';
import { dimensionPeriodDeltas } from '../dimensionPeriodDeltas.js';
import { buildExplorerFindingsNav } from './explorerFindingsNav.js';
import { openScope, SCOPE_KIND } from '../../violations/scope/scopeModel.js';

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
function ExplorerHead({ dim, d, overallScoreNum, standardDescription, activeDateLabel, activeRunId, periodDeltas, onNavigate, handleCardNavigate, onSeverityBadge, filesRead: borrowedFilesRead }) {
  const filesRead = d.evalData.filesRead ?? borrowedFilesRead ?? 0;
  const metrics = scopeMetrics({ sevCounts: d.severityCounts || {}, total: d.allViolations.length, compliance: d.totalCompliant, files: filesRead });
  const actions = onNavigate ? {
    onViolations: () => handleCardNavigate(HERO_CARD_KIND.VIOLATIONS),
    onCompliance: () => handleCardNavigate('compliance'),
    onSeverity: (level) => onSeverityBadge(level)(),
  } : {};
  return (
    <FindingsHead
      title={dim} sub={activeDateLabel || activeRunId || null} description={standardDescription}
      grade={{ score: overallScoreNum, insufficient: d.overallGrade?.grade === GRADE.INSUFFICIENT, hint: null }}
      badge={periodDeltas.score !== null ? <TrendBadge delta={periodDeltas.score} /> : null}
      metrics={metrics} filesHint={t('violations.scopeStatFilesRead', { count: filesRead })} deltas={periodDeltas.chips} actions={actions}
    />
  );
}

/** The happy-path render: header, top grid (stats + radial), principle
 * cards, and the top-offending-files table. */
function ExplorerPageBody({
  isRefreshing, dim, standardDescription, activeDateLabel, activeRunId, overallScoreNum, d,
  onSeverityBadge, onNavigate, handleCardNavigate, trend, granularity, onGranularityChange,
  setActiveRunId, setActiveDateLabel, radialPrinciples, onPrincipleClick, enrichedPrinciples, onFileClick, filesRead,
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
        onNavigate={onNavigate} handleCardNavigate={handleCardNavigate} onSeverityBadge={onSeverityBadge} filesRead={filesRead}
      />

      <ExplorerTopGrid
        d={d} trend={trend} granularity={granularity} onGranularityChange={onGranularityChange}
        setActiveRunId={setActiveRunId} setActiveDateLabel={setActiveDateLabel}
        activeRunId={activeRunId} radialPrinciples={radialPrinciples} onPrincipleClick={onPrincipleClick}
      />

      {/* Header and the top grid paint first; the card row and the files
          table are the heavy part and follow in the next commit. */}
      <DeferredMount fallback={<CardListSkeleton />}>
        <section className="qd-cards-panel" aria-label={t('explorer.principlesAria')}>
          <div className="qd-cards-panel__head">
            <SectionLabel>{t('explorer.principlesLabel')} · {radialPrinciples.length}</SectionLabel>
          </div>
          <PrinciplesCardsRow
            principles={enrichedPrinciples}
            onPrincipleClick={onPrincipleClick}
          />
        </section>

        <section className="qd-cards-panel offending-panel" aria-label={t('overview.violationsByFileAria')}>
          <div className="qd-cards-panel__head">
            <SectionLabel>{t('overview.violationsByFileLabel')} · {d.topFiles.length}</SectionLabel>
            <span className="run-history-panel__stats">{t('overview.sortedBySeverity')}</span>
          </div>
          <TopOffendingFilesTable
            files={d.topFiles}
            onFileClick={onFileClick}
          />
        </section>
      </DeferredMount>
    </div>
  );
}

/** The values derived from `d` once it's known to be ready (dim label,
 * radial/enriched principle views, the principle-click handler, score,
 * refreshing flag). Thread sourceTab through onPrincipleClick: without it a
 * principle click from a Violations-tab drill-in falls back to the
 * Overview tab, swapping the whole page for the Overview and jumping the
 * sidebar highlight. */
function buildExplorerViewData(d, onNavigate, sourceTab, buildEvalPrincipal, principleViews) {
  return {
    dim: String(d.evalData.dimension || '').toLowerCase(),
    radialPrinciples: principleViews.radialPrinciples,
    enrichedPrinciples: principleViews.enrichedPrinciples,
    // Prototype: a principle opens its scoped Findings view.
    onPrincipleClick: (name) => openScope(onNavigate, { kind: SCOPE_KIND.PRINCIPLE, dimension: d.evalData.dimension, principle: name }),
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

  const { handleCardNavigate, onSeverityBadge, onFileClick } = buildExplorerFindingsNav({
    dimension, scoped: scopedFindings, dimFile, onNavigate, project, activeRunId, activeDateLabel, sourceTab, trend,
  });

  const {
    dim, radialPrinciples, enrichedPrinciples, onPrincipleClick, overallScoreNum, isRefreshing,
  } = buildExplorerViewData(d, onNavigate, sourceTab, buildEvalPrincipal, principleViews);

  return (
    <ExplorerPageBody
      isRefreshing={isRefreshing} dim={dim} standardDescription={standardDescription}
      activeDateLabel={activeDateLabel} activeRunId={activeRunId} overallScoreNum={overallScoreNum} d={d}
      onSeverityBadge={onSeverityBadge} onNavigate={onNavigate} handleCardNavigate={handleCardNavigate}
      trend={trend} granularity={granularity} onGranularityChange={onGranularityChange}
      setActiveRunId={setActiveRunId} setActiveDateLabel={setActiveDateLabel}
      radialPrinciples={radialPrinciples} onPrincipleClick={onPrincipleClick} enrichedPrinciples={enrichedPrinciples}
      onFileClick={onFileClick} filesRead={filesRead}
    />
  );
}
