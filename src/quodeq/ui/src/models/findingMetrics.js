/**
 * A set of findings' numbers normalised by size, the way Compare and the
 * Map's Risk sky read them: violations per 100 files, critical per 1,000,
 * the pass rate and, for a folder or an area, its Risk. Read by the
 * Findings headers (a scoped view, the dimension page). Pure functions, no
 * framework imports.
 */
import { MIN_PROD_FILES, judgedFiles, severityWeight, zoneOf } from './riskRules.js';
import { SEVERITY } from '../vocab/severity.js';

const PER_HUNDRED = 100;
// Critical findings are rarer than violations: counted per 1,000 files, as Compare does.
const PER_THOUSAND = 1000;
/** The Risk of a folder or area too small to judge: no zone, as the Map shows it. */
export const RISK_SMALL = 'small';

const pathsOf = (items) => items.map((i) => i.file).filter(Boolean);

/** Each live violation of a scope with the severity bucket it sits in ('unknown' when it has none). */
function liveViolations(file, isLive) {
  return Object.entries(file.violationsBySeverity || {})
    .flatMap(([severity, list]) => list.filter(isLive).map((v) => ({ file: v.file, severity })));
}

/**
 * A folder's or area's Risk, measured as the Map's Risk sky measures an
 * area (core/map_history/area_metrics.py): the weighted issues of its
 * production files over how many there are, its test files left out
 * unless it holds nothing else; a violation of no known severity weighs
 * as a minor one. Under MIN_PROD_FILES such files, or when the Map already
 * judged it small, it is too small to judge (zone RISK_SMALL).
 * @param {{violationsBySeverity: object, compliance: object[]}} file the scope's findings
 * @param {(v: object) => boolean} isLive false for a violation dismissed on this page
 * @param {boolean} [judgedSmall] the Map already judged the area too small
 * @returns {{density: number, zone: string}} weighted issues per file, and a RISK_ZONE or RISK_SMALL
 */
export function areaRisk(file, isLive, judgedSmall = false) {
  const violations = liveViolations(file, isLive);
  const base = judgedFiles(new Set(pathsOf([...violations, ...(file.compliance || [])])));
  const weight = violations.filter((v) => base.has(v.file)).reduce((sum, v) => sum + severityWeight(v.severity), 0);
  const density = base.size ? weight / base.size : 0;
  const small = judgedSmall || base.size < MIN_PROD_FILES;
  return { density, zone: small ? RISK_SMALL : zoneOf(density) };
}

/** The files a scope's checks looked at (a violation or a compliant check): the base where no files-read count exists. */
export function filesChecked(file) {
  return new Set(pathsOf([...Object.values(file.violationsBySeverity || {}).flat(), ...(file.compliance || [])])).size;
}

const perFiles = (count, files, scale) => (files ? (count / files) * scale : null);

/**
 * A scope's numbers. Every live violation counts, a severity unknown to the
 * formula too (`total` holds them; the Map tallies them as minor).
 * @param {{sevCounts: object, total: number, compliance: number, files: number, risk?: ?object}} input
 *   live severity counts, every live violation, compliant checks, the files
 *   the numbers are over, and a folder's or area's areaRisk
 * @returns {{violations: number, compliance: number, sevCounts: object, files: number,
 *   per100: ?number, criticalPerK: ?number, passPct: ?number, risk: ?object}} null where there is no base
 */
export function scopeMetrics({ sevCounts, total, compliance, files, risk = null }) {
  const known = (sevCounts[SEVERITY.CRITICAL] || 0) + (sevCounts[SEVERITY.MAJOR] || 0) + (sevCounts[SEVERITY.MINOR] || 0);
  const violations = Math.max(total ?? known, known);
  const checks = violations + compliance;
  return {
    violations,
    compliance,
    sevCounts,
    files,
    per100: perFiles(violations, files, PER_HUNDRED),
    criticalPerK: perFiles(sevCounts[SEVERITY.CRITICAL] || 0, files, PER_THOUSAND),
    passPct: checks ? Math.round((compliance / checks) * PER_HUNDRED) : null,
    risk,
  };
}

/**
 * A run's dimension (the run-scores shape: `totals` and `filesRead`) read as
 * scopeMetrics reads a scope; null without totals.
 * @param {?{totals?: {severity?: object, violationCount?: number, complianceCount?: number}, filesRead?: number}} dim
 */
export function runDimensionMetrics(dim) {
  const totals = dim?.totals;
  if (!totals) return null;
  return scopeMetrics({ sevCounts: totals.severity || {}, total: totals.violationCount, compliance: totals.complianceCount || 0, files: dim.filesRead || 0 });
}

// The smallest changes worth an arrow: a pass-rate point, a twentieth of a per-file rate (less shows as 0.0).
const MIN_PASS_POINTS = 1;
const MIN_RATE_CHANGE = 0.05;

/** `now - before` when both are numbers and it moved at least `min`; null otherwise. */
function changeOf(now, before, min) {
  if (now == null || before == null) return null;
  const delta = now - before;
  return Math.abs(delta) >= min ? delta : null;
}

/**
 * The header tiles' changes since `previous` (the same numbers for the
 * previous day, week or month): the pass rate in points, per 100 files and
 * critical per 1,000 as rates. Each null when it barely moved or either side
 * has no number; all null without `previous`.
 * @param {object} now scopeMetrics output
 * @param {?object} previous scopeMetrics output
 * @returns {{passPct: ?number, per100: ?number, criticalPerK: ?number}}
 */
export function tileChanges(now, previous) {
  return {
    passPct: changeOf(now.passPct, previous?.passPct, MIN_PASS_POINTS),
    per100: changeOf(now.per100, previous?.per100, MIN_RATE_CHANGE),
    criticalPerK: changeOf(now.criticalPerK, previous?.criticalPerK, MIN_RATE_CHANGE),
  };
}
