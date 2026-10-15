/**
 * What the Overview's header, cards and radial read off the dashboard
 * data: how many dimensions read only part of the files, the previous
 * period's numbers for the tiles' changes, the dimensions weakest
 * first and as radial points, and the note on a past run.
 */
import { formatRunWhen } from '../../utils/dateFormatting.js';
import { buildHeadline } from './headlineStats.js';
import { computeCoverageInfo } from './components/dimensionGaugeMath.js';
import { scopeMetrics } from '../../models/findingMetrics.js';
import { weakestFirst } from '../../models/scoreOrder.js';
import { PERCENT } from '../../constants.js';
import { RUN_STATE } from '../../vocab/runState.js';
import { nameKey } from '../../utils/nameKey.js';


/** How many dimensions read fewer files than the project holds, as the cards round it (under 100%). */
export function partialDimensionCount(dimensions) {
  return (dimensions || []).filter((d) => (computeCoverageInfo(d.filesRead, d.sourceFileCount, d.exitReason).coveragePct ?? PERCENT) < PERCENT).length;
}

/** Severity counts summed over dimensions. */
function summedSeverity(dimensions) {
  return dimensions.reduce((acc, d) => {
    for (const [level, n] of Object.entries(d.totals?.severity || {})) acc[level] = (acc[level] || 0) + n;
    return acc;
  }, {});
}

/**
 * The previous period's numbers, as the header tiles read them, from its
 * as-of scores; only the dimensions on show count. Null with none of them.
 * @param {?object} scores a scores payload (`accumulated.dimensions`)
 * @param {Set<string>} visibleNames lowercase names of the dimensions on show
 * @returns {?object} scopeMetrics output
 */
export function previousPeriodMetrics(scores, visibleNames) {
  const dims = (scores?.accumulated?.dimensions || []).filter((d) => visibleNames.has(nameKey(d.dimension)));
  if (!dims.length) return null;
  const headline = buildHeadline(dims);
  const compliance = dims.reduce((n, d) => n + (d.totals?.complianceCount || 0), 0);
  return scopeMetrics({ sevCounts: summedSeverity(dims), total: headline.violations, compliance, files: headline.filesRead || 0 });
}

/** The dimensions weakest first (Victor's call: the one to open leads), ungraded last. */
export const weakestDimensionFirst = weakestFirst((d) => d.overallScore, (d) => d.dimension);

/** The dimensions as radial points (the dimension page's radial, one level up). */
export function dimensionPoints(dimensions) {
  return (dimensions || []).map((d) => {
    const score = parseFloat(d.overallScore);
    const graded = !Number.isNaN(score);
    return { name: d.dimension, score: graded ? score : null, hasEvidence: graded, thin: false };
  });
}

/**
 * A past run on show (an older run picked, `asOf`): its day, and the way
 * back to the latest finished run. Null on the latest, or with no way back.
 * @param {?{runId: string, day: ?string}} asOf
 * @param {{runId: string, status?: string}[]} availableRuns newest first
 * @param {?(runId: string) => void} onRunClick
 */
export function overviewPastRun(asOf, availableRuns, onRunClick, trend = []) {
  const latest = (availableRuns || []).find((r) => r.status !== RUN_STATE.RUNNING)?.runId;
  if (!asOf || !latest || !onRunClick) return null;
  // When it ran, as a person reads it ("Tue 13 Oct · 04:55"), never the run's id: the score history holds the
  // run's time; the run list only its day.
  const dateISO = (trend || []).find((r) => r.runId === asOf.runId)?.dateISO;
  const dayLabel = (availableRuns || []).find((r) => r.runId === asOf.runId)?.dateLabel || asOf.day || '';
  return { when: formatRunWhen(dateISO, dayLabel), onBack: () => onRunClick(latest) };
}

/**
 * The model a run was evaluated with, from the run log: the run's own, else
 * the newest finished run's; null when the log names none.
 * @param {?object[]} runs run log entries, newest first
 * @param {?string} runId
 */
export function modelOfRun(runs, runId) {
  const list = runs || [];
  const own = list.find((r) => r.runId === runId);
  return own?.model || list.find((r) => r.status === RUN_STATE.DONE)?.model || null;
}
