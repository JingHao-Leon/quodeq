/**
 * Trend principle model: one principle's point in a run's dimension detail.
 *
 * The server sends `trend[].dimensionDetails[].principles` as
 * `{ principle, score, grade, critical, majors, violations }`. Rows cached
 * before the field existed have no `principles` key, and rows the server
 * could not count have null counts: both read as "no data", never as zero.
 *
 * @typedef {Object} TrendPrinciple
 * @property {string}       principle
 * @property {number|null}  score       the score the principle grade shows (0..10)
 * @property {string|null}  grade
 * @property {number|null}  critical
 * @property {number|null}  majors      criticals plus majors, as a dimension's
 * @property {number|null}  violations
 */

const EMPTY = Object.freeze([]);

const countOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function scoreOrNull(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Create a canonical TrendPrinciple from a raw API object.
 *
 * @param {Object} raw
 * @returns {TrendPrinciple}
 */
export function createTrendPrinciple(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  return {
    principle:  raw.principle ?? '',
    score:      scoreOrNull(raw.score),
    grade:      raw.grade ?? null,
    critical:   countOrNull(raw.critical),
    majors:     countOrNull(raw.majors),
    violations: countOrNull(raw.violations),
  };
}

/**
 * The principles of one trend dimension detail as TrendPrinciple models;
 * empty when the detail predates the field.
 *
 * @param {Object|null|undefined} detail A `trend[].dimensionDetails[]` entry.
 * @returns {TrendPrinciple[]}
 */
export function trendDetailPrinciples(detail) {
  const raw = detail?.principles;
  return Array.isArray(raw) ? raw.map(createTrendPrinciple) : EMPTY;
}
