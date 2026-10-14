/**
 * "Since the previous day, week or month": what the run comparisons
 * (GET runs/{run}/diff?against={run that closed the previous period}) say
 * changed, finding by finding. Read by the Overview, the dimension page and
 * a principle's page. Pure functions, no framework imports.
 */
import { scoreChangeShows } from '../utils/trendUtils.js';
import { nameKey } from '../utils/nameKey.js';

// The dimensions the Overview's since line names as moving most.
const MOVERS_SHOWN = 3;

/** The items of `list` that belong to `principle` (any case); all of them without one. */
function ofPrinciple(list, principle) {
  const items = list || [];
  return principle ? items.filter((f) => nameKey(f.principle) === nameKey(principle)) : items;
}

/**
 * One dimension's new and fixed findings in a comparison: its counts, or,
 * narrowed to a principle (or with no counts), its listed findings.
 */
function dimensionCounts(d, principle) {
  if (principle) return { added: ofPrinciple(d.new, principle).length, fixed: ofPrinciple(d.resolved, principle).length };
  return { added: d.counts?.new ?? ofPrinciple(d.new).length, fixed: d.counts?.resolved ?? ofPrinciple(d.resolved).length };
}

/** A dimension's rule types that appeared and went away, keyed by dimension (a principle has none of its own). */
function addTypes(sets, dimension, d) {
  for (const rule of d.types?.opened || []) sets.opened.add(`${dimension}:${rule}`);
  for (const rule of d.types?.closed || []) sets.closed.add(`${dimension}:${rule}`);
}

/**
 * One "since the previous period" summary from run comparisons: new and
 * fixed findings, and the rule types that appeared or went away. `keep`
 * picks which dimensions count (by name, from which comparison);
 * `principle` narrows to one principle's findings (and counts no rule
 * types). Null when nothing was compared.
 * @param {Array<object|undefined>} payloads usePeriodDiffs payloads
 * @param {(dimension: string, payloadIndex: number) => boolean} keep
 * @param {?string} [principle]
 * @returns {?{newCount: number, resolvedCount: number, typesOpened: number, typesClosed: number}}
 */
export function sinceSummary(payloads, keep, principle = null) {
  let compared = 0;
  const total = { newCount: 0, resolvedCount: 0 };
  const types = { opened: new Set(), closed: new Set() };
  (payloads || []).forEach((payload, i) => {
    for (const [dimension, d] of Object.entries(payload?.dimensions || {})) {
      if (!keep(dimension, i)) continue;
      compared += 1;
      const { added, fixed } = dimensionCounts(d, principle);
      total.newCount += added;
      total.resolvedCount += fixed;
      if (!principle) addTypes(types, dimension, d);
    }
  });
  if (!compared) return null;
  return { ...total, typesOpened: types.opened.size, typesClosed: types.closed.size };
}

/**
 * The run that closed the previous period: the row after the one on show in
 * a period trend (newest first; the newest row when none is on show). Null
 * when the run on show is not in it or is the oldest.
 * @param {?Array<{runId: string}>} periodTrend
 * @param {?string} runOnShow
 * @returns {?string}
 */
export function runClosingPreviousPeriod(periodTrend, runOnShow) {
  const rows = periodTrend || [];
  const at = runOnShow ? rows.findIndex((r) => r.runId === runOnShow) : 0;
  return at >= 0 ? rows[at + 1]?.runId ?? null : null;
}

/**
 * The dimensions that moved most this period, largest change first: those
 * whose change shows (scoreChangeShows), at most MOVERS_SHOWN.
 * @param {Object<string, {delta: ?number}>} dimTrends by lowercase dimension name
 * @returns {{name: string, delta: number}[]}
 */
export function topMovers(dimTrends) {
  return Object.entries(dimTrends || {})
    .map(([name, entry]) => ({ name, delta: entry?.delta }))
    .filter((m) => typeof m.delta === 'number' && scoreChangeShows(m.delta))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, MOVERS_SHOWN);
}
