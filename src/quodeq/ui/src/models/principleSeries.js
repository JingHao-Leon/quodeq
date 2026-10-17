/**
 * Principle series model: one dimension's per-principle score history, from
 * GET .../dimensions/<dimension>/principle-series.
 *
 * Rows are runs that scored the dimension, newest first like the trend:
 * `{ runId, dateISO, dateLabel, principles: [{ principle, score, grade,
 * critical, majors, violations }] }`. Counts the server could not know (a
 * cached row from before they were stored) arrive as null and stay null:
 * "no data", never zero.
 *
 * @typedef {Object} SeriesPrinciple
 * @property {string}       principle
 * @property {number|null}  score       the score the principle grade shows (0..10)
 * @property {string|null}  grade
 * @property {number|null}  critical
 * @property {number|null}  majors      criticals plus majors, as a dimension's
 * @property {number|null}  violations
 *
 * @typedef {Object} PrincipleSeriesRow
 * @property {string}             runId
 * @property {string|null}        dateISO
 * @property {string}             dateLabel
 * @property {SeriesPrinciple[]}  principles
 *
 * @typedef {Object} PrincipleSeries
 * @property {string}               dimension
 * @property {PrincipleSeriesRow[]} rows  newest first
 */

const EMPTY = Object.freeze([]);

const isRecord = (raw) => Boolean(raw) && typeof raw === 'object';

const countOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function scoreOrNull(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Create a canonical SeriesPrinciple from a raw API object.
 * @param {Object} raw
 * @returns {SeriesPrinciple}
 */
export function createSeriesPrinciple(raw) {
  if (!isRecord(raw)) return raw;
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
 * Create a canonical PrincipleSeriesRow from a raw API row.
 * @param {Object} raw
 * @returns {PrincipleSeriesRow}
 */
export function createPrincipleSeriesRow(raw) {
  if (!isRecord(raw)) return raw;
  return {
    runId:      raw.runId ?? '',
    dateISO:    raw.dateISO ?? null,
    dateLabel:  raw.dateLabel ?? '',
    principles: Array.isArray(raw.principles) ? raw.principles.map(createSeriesPrinciple) : EMPTY,
  };
}

/**
 * Create a canonical PrincipleSeries from the raw response.
 * @param {Object} raw
 * @returns {PrincipleSeries}
 */
export function createPrincipleSeries(raw) {
  if (!isRecord(raw)) return raw;
  return {
    dimension: raw.dimension ?? '',
    rows:      Array.isArray(raw.rows) ? raw.rows.map(createPrincipleSeriesRow) : EMPTY,
  };
}
