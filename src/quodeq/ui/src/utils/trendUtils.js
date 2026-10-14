/** Shared trend-direction thresholds used by TrendBadge. */
export const IMPROVING_THRESHOLD = 1;
export const DECLINING_THRESHOLD = -1;
export const SOFT_UP_THRESHOLD = 0.1;
export const SOFT_DOWN_THRESHOLD = -0.1;

/**
 * Compute a trend direction string from a numeric delta.
 * @param {number|null|undefined} delta
 * @returns {'up'|'soft-up'|'same'|'soft-down'|'down'|null}
 */
export function trendDirection(delta) {
  if (delta === null || delta === undefined) return null;
  if (delta > IMPROVING_THRESHOLD) return 'up';
  if (delta > SOFT_UP_THRESHOLD) return 'soft-up';
  if (delta < DECLINING_THRESHOLD) return 'down';
  if (delta < SOFT_DOWN_THRESHOLD) return 'soft-down';
  return 'same';
}

// A score change under a twentieth of a point shows as 0.0: no arrow for it.
const MIN_SHOWN_SCORE_CHANGE = 0.05;

/**
 * Whether a score change is worth an arrow (a principle card's, a principle
 * header's): it is a number and it shows as at least 0.1 once rounded.
 * @param {number|string|null|undefined} delta
 * @returns {boolean}
 */
export function scoreChangeShows(delta) {
  return delta !== null && delta !== undefined && Math.abs(Number(delta)) >= MIN_SHOWN_SCORE_CHANGE;
}
