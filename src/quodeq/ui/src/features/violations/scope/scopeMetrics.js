import { DEFAULT_SEVERITY_WEIGHTS } from '../../map/viz/core/mapBadness.js';
import { zoneOf } from '../../map/viz/core/skyScale.js';

const PER_HUNDRED = 100;
// Critical findings are rarer than violations: counted per 1,000 files, as Compare does.
const PER_THOUSAND = 1000;

// A test file, as the Map's areas tell one (core/map_history/areas.py _TEST_SEGMENT).
const TEST_SEGMENT = /(^|\/)(\w*tests?|androidtest|uitests|spec|__tests__)(\/|$)/i;
const KNOWN_WEIGHTS = new Set(Object.keys(DEFAULT_SEVERITY_WEIGHTS));
// Fewer production files than this and the Map does not judge an area (area_metrics.py MIN_PROD_FILES).
const MIN_PROD_FILES = 3;
/** The Risk of a folder or area too small to judge: no zone, as the Map shows it. */
export const RISK_SMALL = 'small';

/**
 * A folder's or area's Risk, measured as the Map's Risk sky measures an
 * area (core/map_history/area_metrics.py): the weighted issues of its
 * production files over how many there are, its test files left out
 * unless it holds nothing else; a violation of no known severity weighs
 * as a minor one. Under three such files it is too small to judge (zone `RISK_SMALL`).
 * @param {{violationsBySeverity: object, compliance: object[]}} file scopeFindings output
 * @param {(v: object) => boolean} isLive false for a violation dismissed on this page
 * @param {boolean} [judgedSmall] the Map already judged the area too small
 */
export function areaRisk(file, isLive, judgedSmall = false) {
  // Each violation with the severity bucket it sits in (its own severity, normalised; 'unknown' when none).
  const violations = Object.entries(file.violationsBySeverity || {})
    .flatMap(([sev, list]) => list.filter(isLive).map((v) => ({ file: v.file, sev })));
  const paths = new Set([...violations, ...(file.compliance || [])].map((i) => i.file).filter(Boolean));
  const prod = [...paths].filter((p) => !TEST_SEGMENT.test(p));
  const base = new Set(prod.length ? prod : paths);
  const weight = violations.filter((v) => base.has(v.file))
    .reduce((sum, v) => sum + DEFAULT_SEVERITY_WEIGHTS[KNOWN_WEIGHTS.has(v.sev) ? v.sev : 'minor'], 0);
  const density = base.size ? weight / base.size : 0;
  return { density, zone: judgedSmall || base.size < MIN_PROD_FILES ? RISK_SMALL : zoneOf(density) };
}

/** The files a scope's checks looked at (a violation or a compliant check): the base where no files-read count exists. */
export function filesChecked(file) {
  return new Set([...Object.values(file.violationsBySeverity || {}).flat(), ...(file.compliance || [])]
    .map((i) => i.file).filter(Boolean)).size;
}

/**
 * Findings normalised by size, the way Compare and the Map Risk sky read
 * them: violations per 100 files, critical per 1,000, the pass rate, and
 * the weighted issues per file with the Risk zone they fall in (`risk`,
 * from areaRisk, replaces those two for a folder or an area).
 * A violation of no known severity weighs as a minor one, as the Map tallies it.
 * @param {{sevCounts: {critical?: number, major?: number, minor?: number}, total: number, compliance: number, files: number}} input
 *   live severity counts, every live violation (unknown severities included),
 *   compliant checks, the files the numbers are over, and a folder's or area's own Risk
 */
export function scopeMetrics({ sevCounts, total, compliance, files, risk = null }) {
  const known = (sevCounts.critical || 0) + (sevCounts.major || 0) + (sevCounts.minor || 0);
  const violations = Math.max(total ?? known, known);
  const tallied = { ...sevCounts, minor: (sevCounts.minor || 0) + violations - known };
  const checks = violations + compliance;
  const weighted = Object.entries(DEFAULT_SEVERITY_WEIGHTS).reduce((sum, [sev, w]) => sum + (tallied[sev] || 0) * w, 0);
  const density = files ? weighted / files : 0;
  return {
    violations,
    compliance,
    sevCounts,
    files,
    per100: files ? (violations / files) * PER_HUNDRED : null,
    criticalPerK: files ? ((sevCounts.critical || 0) / files) * PER_THOUSAND : null,
    passPct: checks ? Math.round((compliance / checks) * PER_HUNDRED) : null,
    density: risk ? risk.density : density,
    zone: risk ? risk.zone : zoneOf(density),
  };
}
