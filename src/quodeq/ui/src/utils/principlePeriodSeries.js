/**
 * Per-principle score series over a dimension's principle-series rows
 * (GET .../dimensions/<dimension>/principle-series, newest first), bucketed
 * the way the dimension series is (extractDimensionPeriodSeries in
 * dailyGrouping.js): one point per period bucket, from the newest run in it
 * that scored the principle, oldest first. A bucket where the principle was
 * not scored is passed over, so a period without an evaluation moves nothing
 * (carry-over).
 */
import { GRANULARITY } from './granularity.js';
import { extractPeriodSeries } from './dailyGrouping.js';
import { createSeriesPrinciple } from '../models/principleSeries.js';

const COUNT_KEYS = Object.freeze(['critical', 'majors', 'violations']);

/**
 * @param {Array} rows             The series rows, newest first.
 * @param {string} principle       Exact principle name, as the grades name it.
 * @param {'day'|'week'|'month'} [granularity='day']
 * @param {number} [limit=Infinity] Max buckets to keep (newest buckets win).
 * @returns {Array<{runId:string, dateISO:string, dateLabel:string, score:number, grade:(string|null),
 *   critical:(number|null), majors:(number|null), violations:(number|null)}>}
 *   Oldest-first. Counts are null where the run's row could not count them.
 */
export function principlePeriodSeries(rows, principle, granularity = GRANULARITY.DAY, limit = Infinity) {
  if (!principle) return [];
  return extractPeriodSeries(rows, (row) => {
    const raw = (row?.principles || []).find((p) => p?.principle === principle);
    const match = raw ? createSeriesPrinciple(raw) : null;
    if (!match || match.score === null) return null;
    const { score, grade, critical, majors, violations } = match;
    return { runId: row.runId, dateISO: row.dateISO, dateLabel: row.dateLabel,
      score, grade, critical, majors, violations };
  }, granularity, limit);
}

const difference = (now, before) => (now === null || before === null ? null : now - before);

/**
 * The principle's change since the previous bucket: its newest bucket
 * against the one before it, same bucketing as principlePeriodSeries.
 *
 * @param {Array} rows             The series rows, newest first (cut at the run on show first).
 * @param {string} principle       Exact principle name.
 * @param {'day'|'week'|'month'} [granularity='day']
 * @returns {{score:(number|null), critical:(number|null), majors:(number|null), violations:(number|null)}}
 *   All null without a previous bucket; a count is null when either bucket lacks it.
 */
export function principlePeriodDelta(rows, principle, granularity = GRANULARITY.DAY) {
  const series = principlePeriodSeries(rows, principle, granularity, 2);
  const [before, now] = series.length === 2 ? series : [null, null];
  const delta = { score: before ? now.score - before.score : null };
  for (const key of COUNT_KEYS) delta[key] = before ? difference(now[key], before[key]) : null;
  return delta;
}
