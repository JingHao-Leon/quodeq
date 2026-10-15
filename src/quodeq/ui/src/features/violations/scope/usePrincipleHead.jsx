/**
 * What a principle's page adds to its header: the standard's description of
 * it, its score and grade, its change since the previous day, week or month
 * (as its card on the dimension page shows it), the same numbers in the
 * previous period's run (for the tiles' and severities' changes), when its
 * dimension was evaluated, its since line, its Risk: how many of the
 * Map's areas its findings put in fix first and watch, and its score per
 * period for the line under its description. Every other scope gets none.
 */
import { useMemo } from 'react';
import { usePrinciplePeriodDeltas } from '../../../hooks/usePrinciplePeriodDeltas.js';
import { usePeriodDiffs } from '../../../hooks/usePeriodDiffs.js';
import { sinceSummary } from '../../../models/sinceSummary.js';
import { useStandardDescriptions } from '../../explorer/hooks/useStandardDescriptions.js';
import useRiskAreas from '../../map/hooks/useRiskAreas.js';
import { usePrincipleSeries } from '../../../hooks/usePrincipleSeries.js';
import { principlePeriodSeries } from '../../../utils/principlePeriodSeries.js';
import { reworkSummary } from '../../map/model/rankedAreas.js';
import { riskMapParams } from '../../map/model/riskLinks.js';
import { principleGradeOf, SCOPE_KIND } from './scopeModel.js';
import { GRADE } from '../../../vocab/grade.js';
import { EVIDENCE_CONFIDENCE } from '../../../vocab/evidenceConfidence.js';
import { SEVERITY, SEVERITY_ORDER } from '../../../vocab/severity.js';
import { t } from '../../../strings/index.js';
import { nameKey } from '../../../utils/nameKey.js';


/** A principle's grade for its header ring: its score, whether the evidence grades it at all, and what the evidence says. */
function gradeOf(row) {
  if (!row) return null;
  const insufficient = row.grade === GRADE.INSUFFICIENT;
  const hint = insufficient ? t('explorer.notEnoughEvidence')
    : row.confidence === EVIDENCE_CONFIDENCE.LOW ? t('explorer.thinEvidenceHint') : null;
  return { score: row.score, insufficient, hint };
}

/**
 * The principle's own numbers in the previous period's run (`previousDim`, a
 * run's dimension with its findings): its violations by severity (one of no
 * known severity counts as minor) and its compliant checks; null without
 * that run.
 * @param {?{violations?: object[], compliance?: object[]}} previousDim
 * @param {string} principle
 * @returns {?{sevCounts: object, total: number, compliance: number}}
 */
export function previousPrincipleCounts(previousDim, principle) {
  if (!previousDim) return null;
  const mine = (list) => (list || []).filter((f) => nameKey(f.principle) === nameKey(principle));
  const violations = mine(previousDim.violations);
  const sevCounts = Object.fromEntries(SEVERITY_ORDER.map((level) => [level, 0]));
  for (const v of violations) {
    const level = nameKey(v.severity);
    sevCounts[level in sevCounts ? level : SEVERITY.MINOR] += 1;
  }
  return { sevCounts, total: violations.length, compliance: mine(previousDim.compliance).length };
}

/**
 * The severities' change since the previous period (now minus then), as
 * the header's badges read it; undefined without the previous counts.
 * @param {object} sevCounts the live counts now
 * @param {?{sevCounts: object}} previous previousPrincipleCounts output
 */
export function severityDeltas(sevCounts, previous) {
  if (!previous) return undefined;
  return Object.fromEntries(SEVERITY_ORDER.map((level) => [level, (sevCounts[level] || 0) - (previous.sevCounts[level] || 0)]));
}

/**
 * What the period hooks need for a principle scope: the project (none for
 * any other scope, so nothing is fetched), the history and its grouping, and
 * the run on show (the past day's, else the dimension's own).
 */
function periodArgs({ isPrinciple, scope, dim, history, principles }) {
  return {
    project: isPrinciple ? history?.project : null, selectedSource: history?.selectedSource, trend: history?.trend,
    dimension: scope.dimension, granularity: history?.granularity, activeRunId: history?.runId || dim?.fromRunId || null, principles,
  };
}

/**
 * The principle's since line: the run on show compared with the run that
 * closed the previous period, narrowed to the principle's findings.
 */
function usePrincipleSince({ args, beforeRunId, scope, isPrinciple }) {
  const { payloads } = usePeriodDiffs({ project: args.project, source: args.selectedSource, runs: [args.activeRunId], against: beforeRunId });
  return useMemo(
    () => (isPrinciple ? sinceSummary(payloads, (name) => nameKey(name) === nameKey(scope.dimension), scope.principle) : null),
    [isPrinciple, payloads, scope.dimension, scope.principle],
  );
}

const NO_DIMENSIONS = [];

/**
 * The principle's Risk tile: the Map's areas measured over its findings
 * (its dimension narrowed to it), counted in fix first and watch, opening
 * the Risk tab on the principle. Null for any other scope, for a shared
 * project (no Map history), while the areas load and when they failed to.
 */
function usePrincipleRisk({ isPrinciple, scope, history, onOpenMap }) {
  const dimensions = useMemo(() => (isPrinciple ? [scope.dimension] : NO_DIMENSIONS), [isPrinciple, scope.dimension]);
  const { areas, loading, failed, unavailable } = useRiskAreas({
    project: isPrinciple ? history?.project : null, source: history?.selectedSource, dimensions,
    principle: isPrinciple ? scope.principle : '', active: isPrinciple,
  });
  const { fixFirst, watch } = useMemo(() => reworkSummary(areas), [areas]);
  if (!isPrinciple || !history?.project || loading || failed || unavailable) return null;
  const onOpen = onOpenMap ? () => onOpenMap(riskMapParams({ dimensions, principle: scope.principle })) : undefined;
  // The Map measures today's findings: on a past run the tile says its areas are today's.
  return { fixFirst, watch, onOpen, today: Boolean(history?.runId) };
}

// The header's line shows this many periods at most (the dimension chart shows 16).
const HISTORY_PERIODS = 16;

/**
 * The principle's score per period of the chart's grouping (at most
 * HISTORY_PERIODS, oldest first), from its dimension's series, for the
 * header's score line; null for any other scope and until the series loads.
 * @returns {?{points: object[], label: string}}
 */
export function usePrincipleScoreHistory({ isPrinciple, scope, history }) {
  const { rows } = usePrincipleSeries(isPrinciple ? history?.project : null, history?.selectedSource, isPrinciple ? scope.dimension : null);
  return useMemo(() => {
    if (!isPrinciple) return null;
    const points = principlePeriodSeries(rows, scope.principle, history?.granularity, HISTORY_PERIODS);
    return points.length ? { points, label: t('violations.sparkAria', { principle: scope.principle }) } : null;
  }, [isPrinciple, rows, scope.principle, history?.granularity]);
}

/**
 * @param {object} scope readScope output
 * @param {object[]} dims the dimensions on show
 * @param {?{project: string, selectedSource: string, trend: object[], granularity: string, runId: ?string}} history
 * @param {(params: object) => void} [onOpenMap] opens the Map with these nav params
 * @returns {{description?: string, grade?: ?object, change?: ?number, when?: ?string, previous?: ?object, since?: ?object,
 *   riskAreas?: ?{fixFirst: number, watch: number, onOpen?: Function, today: boolean}, scoreHistory?: ?{points: object[], label: string}}}
 */
export function usePrincipleHead(scope, dims, history, onOpenMap) {
  const isPrinciple = scope.kind === SCOPE_KIND.PRINCIPLE;
  const { principleDescriptions } = useStandardDescriptions(isPrinciple ? scope.dimension : null);
  const row = isPrinciple ? principleGradeOf(scope, dims) : null;
  const dim = isPrinciple ? dims.find((d) => d.dimension === scope.dimension) : null;
  const principles = useMemo(() => (row ? [{ principle: scope.principle, score: row.score }] : []), [row, scope.principle]);
  const args = periodArgs({ isPrinciple, scope, dim, history, principles });
  const { principles: changes, previous, beforeRunId } = usePrinciplePeriodDeltas(args);
  const since = usePrincipleSince({ args, beforeRunId, scope, isPrinciple });
  const riskAreas = usePrincipleRisk({ isPrinciple, scope, history, onOpenMap });
  const scoreHistory = usePrincipleScoreHistory({ isPrinciple, scope, history });
  if (!isPrinciple) return {};
  return {
    description: principleDescriptions?.[scope.principle] || '',
    grade: gradeOf(row),
    change: changes.get(scope.principle) ?? null,
    when: dim?.fromDateLabel || null,
    previous: previousPrincipleCounts(previous, scope.principle),
    since,
    riskAreas,
    scoreHistory,
  };
}
