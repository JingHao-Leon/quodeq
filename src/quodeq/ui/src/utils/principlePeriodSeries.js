/**
 * Per-principle score series over the trend, bucketed the way the
 * dimension series is (extractDimensionPeriodSeries in dailyGrouping.js):
 * one point per period bucket, from the newest run in it that scored the
 * principle, oldest first. A bucket where the principle was not scored
 * (the dimension skipped, or a row from before the field) is passed over,
 * so a period without an evaluation moves nothing.
 */
import { GRANULARITY } from './granularity.js';
import { extractPeriodSeries, findDimensionDetail } from './dailyGrouping.js';
import { trendDetailPrinciples } from '../models/trendPrinciple.js';

const COUNT_KEYS = Object.freeze(['critical', 'majors', 'violations']);

/**
 * @param {Array} trend            Trend entries, newest-first.
 * @param {string} dimension       Case-insensitive.
 * @param {string} principle       Exact principle name, as the grades name it.
 * @param {'day'|'week'|'month'} [granularity='day']
 * @param {number} [limit=Infinity] Max buckets to keep (newest buckets win).
 * @returns {Array<{runId:string, dateISO:string, dateLabel:string, score:number, grade:(string|null),
 *   critical:(number|null), majors:(number|null), violations:(number|null)}>}
 *   Oldest-first. Counts are null where the run's row could not count them.
 */
export function principlePeriodSeries(trend, dimension, principle, granularity = GRANULARITY.DAY, limit = Infinity) {
  if (!dimension || !principle) return [];
  const want = String(dimension).toLowerCase();
  return extractPeriodSeries(trend, (entry) => {
    const match = trendDetailPrinciples(findDimensionDetail(entry, want)).find((p) => p.principle === principle);
    if (!match || match.score === null) return null;
    const { score, grade, critical, majors, violations } = match;
    return { runId: entry.runId, dateISO: entry.dateISO, dateLabel: entry.dateLabel,
      score, grade, critical, majors, violations };
  }, granularity, limit);
}

const difference = (now, before) => (now === null || before === null ? null : now - before);

/**
 * The principle's change since the previous bucket: its newest bucket
 * against the one before it, same bucketing as principlePeriodSeries.
 *
 * @param {Array} trend            Trend entries, newest-first (slice at the run on show first).
 * @param {string} dimension       Case-insensitive.
 * @param {string} principle       Exact principle name.
 * @param {'day'|'week'|'month'} [granularity='day']
 * @returns {{score:(number|null), critical:(number|null), majors:(number|null), violations:(number|null)}}
 *   All null without a previous bucket; a count is null when either bucket lacks it.
 */
export function principlePeriodDelta(trend, dimension, principle, granularity = GRANULARITY.DAY) {
  const series = principlePeriodSeries(trend, dimension, principle, granularity, 2);
  const [before, now] = series.length === 2 ? series : [null, null];
  const delta = { score: before ? now.score - before.score : null };
  for (const key of COUNT_KEYS) delta[key] = before ? difference(now[key], before[key]) : null;
  return delta;
}
