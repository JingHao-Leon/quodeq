import { useMemo, useState, useEffect } from 'react';
import { buildProjectRootFile } from '../../../utils/explorerUtils.js';
import { useExplorerData, buildEvalPrincipalFn } from './explorerDataHooks.js';
import { useStandardDescriptions } from '../hooks/useStandardDescriptions.js';
import OverviewSkeleton from '../../dashboard/components/OverviewSkeleton.jsx';
import DeferredMount from '../../../components/DeferredMount.jsx';
import CardListSkeleton from '../../../components/CardListSkeleton.jsx';
import DimensionScoreHistoryPanel from './DimensionScoreHistoryPanel.jsx';
import { usePrinciplePeriodDeltas } from '../../../hooks/usePrinciplePeriodDeltas.js';
import { usePeriodDiffs } from '../../../hooks/usePeriodDiffs.js';
import { sinceSummary } from '../../../models/sinceSummary.js';
import SinceStrip from '../../../components/SinceStrip.jsx';
import { HERO_CARD_KIND } from '../../../vocab/heroCardKind.js';
import RadialPanel from '../../../components/radial/RadialPanel.jsx';
import { hasRadialShape } from '../../../components/radial/radialGeometry.js';
import { ExplorerHead, PrinciplesPanel, DimensionFindingsPanels, pastRunNote } from './explorerPageSections.jsx';
import { useExplorerPageSpecs } from './useExplorerPageSpecs.jsx';
import { buildRadialPrinciples, buildEnrichedPrinciples } from './explorerPrincipleView.js';
import { t } from '../../../strings/index.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { useExplorerTrend } from './useExplorerTrend.js';
import { dimensionPeriodDeltas } from '../dimensionPeriodDeltas.js';
import { buildExplorerFindingsNav } from './explorerFindingsNav.js';

/** Empty/loading/error states, checked in order — extracted so the main
 * render stays a single happy-path return. The loading state is the page's
 * own footprint (the Overview's skeleton under the dimension's name: header,
 * since strip, principle cards, history, Fix first), so the navigation paints
 * as this page in its final shape, not as a bare title over a loader. */
function explorerPageStatus(d, dimension) {
  if (d.loading) {
    return (
      <div className="explorer-page">
        <OverviewSkeleton title={String(dimension || '').toLowerCase()} cardsLabel={t('explorer.principlesLabel')} />
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
  const { standardDescription, standardInfo } = useStandardDescriptions(dimension);

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
    d, standardDescription, standardInfo, activeRunId, setActiveRunId, activeDateLabel, setActiveDateLabel,
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

/** Top grid: the score history beside the principles radial (the history alone under three principles, which draw no shape). */
function ExplorerTopGrid({ d, trend, granularity, onGranularityChange, setActiveRunId, setActiveDateLabel, activeRunId, radialPrinciples, onPrincipleClick, lit }) {
  const radial = hasRadialShape(radialPrinciples.length);
  return (
    <div className={`qd-top-grid explorer-top-grid${radial ? '' : ' qd-top-grid--single'}`}>
      <DimensionScoreHistoryPanel
        trend={trend} dimension={d.evalData.dimension} selectedRunId={activeRunId}
        granularity={granularity} onGranularityChange={onGranularityChange}
        onBarClick={(point) => { setActiveRunId(point.runId); setActiveDateLabel(point.dateLabel); }}
      />
      {radial && <RadialPanel radialPrinciples={radialPrinciples} onPrincipleClick={onPrincipleClick} highlighted={lit.principle} onHover={lit.setPrinciple} />}
    </div>
  );
}

/**
 * What the page's parts share beyond the data: the principle lit by a card
 * or the radial (hover or keyboard focus), each principle's change since the
 * previous period and that period's dimension, and the dimension's findings
 * as the panels read them.
 */
function useDimensionPageState({ project, selectedSource, trend, dim, granularity, activeRunId, enrichedPrinciples, d }) {
  const [principle, setPrinciple] = useState(null);
  const lit = useMemo(() => ({ principle, setPrinciple }), [principle]);
  const { principles: principleDeltas, previous, beforeRunId } = usePrinciplePeriodDeltas({
    project, selectedSource, trend, dimension: dim, granularity, activeRunId, principles: enrichedPrinciples,
  });
  const { dimension } = d.evalData;
  const fixFirstDims = useMemo(() => [{ dimension, violations: d.allViolations }], [dimension, d.allViolations]);
  return { lit, principleDeltas, previous, beforeRunId, fixFirstDims };
}

/** The dimension's since line: the run on show compared, finding by finding, with the run that closed the previous period. */
function useDimensionSince({ project, selectedSource, runOnShow, beforeRunId, dim }) {
  const { payloads } = usePeriodDiffs({ project, source: selectedSource, runs: [runOnShow], against: beforeRunId });
  return useMemo(() => sinceSummary(payloads, (name) => name.toLowerCase() === dim), [payloads, dim]);
}

/** The happy-path render: header, since line, principle cards, top grid
 * (score history + radial), then Fix first beside where the findings are. */
function ExplorerPageBody({
  isRefreshing, dim, standardDescription, standardInfo, activeDateLabel, activeRunId, overallScoreNum, d,
  findingsNav, headActions, trend, granularity, onGranularityChange,
  setActiveRunId, setActiveDateLabel, radialPrinciples, enrichedPrinciples, filesRead, project, selectedSource, latestRunId,
}) {
  // The arrows on the title, the score and the chips: this dimension's
  // change since the previous period of the chart's grouping, as of the
  // run on show, the way the Overview's cards and hero read.
  const periodDeltas = useMemo(
    () => dimensionPeriodDeltas(trend, dim, granularity, activeRunId),
    [trend, dim, granularity, activeRunId],
  );
  const { lit, principleDeltas, previous, beforeRunId, fixFirstDims } = useDimensionPageState({
    project, selectedSource, trend, dim, granularity, activeRunId, enrichedPrinciples, d,
  });
  const since = useDimensionSince({ project, selectedSource, runOnShow: activeRunId || latestRunId, beforeRunId, dim });
  const pastRun = pastRunNote({ latestRunId, activeRunId, activeDateLabel, trend, setActiveRunId, setActiveDateLabel });
  return (
    <div className={`explorer-page dashboard-fade${isRefreshing ? ' section-pending' : ''}`}>
      <ExplorerHead
        dim={dim} d={d} overallScoreNum={overallScoreNum} standardDescription={standardDescription} standardInfo={standardInfo}
        activeDateLabel={activeDateLabel} activeRunId={activeRunId} periodDeltas={periodDeltas}
        actions={headActions} filesRead={filesRead} previous={previous} pastRun={pastRun}
        since={<SinceStrip summary={since} granularity={granularity} />}
      />

      {/* The header paints first; the card row and the findings panels are the
          heavy part and follow in the next commit. */}
      <DeferredMount fallback={<CardListSkeleton />}>
        <PrinciplesPanel radialPrinciples={radialPrinciples} enrichedPrinciples={enrichedPrinciples} onPrincipleClick={findingsNav.onPrincipleClick}
          lit={lit} deltas={principleDeltas} />
      </DeferredMount>

      <ExplorerTopGrid
        d={d} trend={trend} granularity={granularity} onGranularityChange={onGranularityChange}
        setActiveRunId={setActiveRunId} setActiveDateLabel={setActiveDateLabel}
        activeRunId={activeRunId} radialPrinciples={radialPrinciples} onPrincipleClick={findingsNav.onPrincipleClick} lit={lit}
      />

      <DeferredMount fallback={<CardListSkeleton />}>
        <DimensionFindingsPanels d={d} fixFirstDims={fixFirstDims} findingsNav={findingsNav} litPrinciple={lit.principle}
          project={project} selectedSource={selectedSource} areasOfToday={Boolean(pastRun)} />
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
    d, standardDescription, standardInfo, activeRunId, setActiveRunId, activeDateLabel, setActiveDateLabel,
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
      isRefreshing={isRefreshing} dim={dim} standardDescription={standardDescription} standardInfo={standardInfo}
      activeDateLabel={activeDateLabel} activeRunId={activeRunId} overallScoreNum={overallScoreNum} d={d}
      findingsNav={findingsNav} headActions={onNavigate ? headActionsOf(findingsNav) : {}}
      trend={trend} granularity={granularity} onGranularityChange={onGranularityChange}
      setActiveRunId={setActiveRunId} setActiveDateLabel={setActiveDateLabel}
      radialPrinciples={radialPrinciples} enrichedPrinciples={enrichedPrinciples} filesRead={filesRead}
      project={project} selectedSource={selectedSource} latestRunId={scopedFindings?.latestRunId ?? null}
    />
  );
}
