/**
 * The Risk measure, as the Map's Risk sky reads an area and the Findings
 * headers read a folder or an area: findings weighted by severity over the
 * production files, and the zone that density falls in. Mirrors
 * core/map_history/area_metrics.py and areas.py. Pure functions, no
 * framework imports.
 */
import { RISK_ZONE } from '../vocab/riskZone.js';
import { SEVERITY } from '../vocab/severity.js';

/** The grade formula's default severity weights (core/scoring/constants.py; tests/test_ui_risk_weights_match_formula.py keeps them equal). */
export const SEVERITY_WEIGHTS = Object.freeze({ [SEVERITY.CRITICAL]: 7.5, [SEVERITY.MAJOR]: 2, [SEVERITY.MINOR]: 0.15 });
/** "Fix first" zone, weighted findings per file: mirrors FLOOR_HOTSPOT in area_metrics.py. */
export const FIX_FIRST_DENSITY = 0.75;
/** "Watch" zone, weighted findings per file: mirrors FLOOR_DORMANT in area_metrics.py. */
export const WATCH_DENSITY = 0.5;
/** Fewer production files than this and an area is too small to judge (area_metrics.py MIN_PROD_FILES). */
export const MIN_PROD_FILES = 3;

// A test file, as the Map's areas tell one (areas.py _TEST_SEGMENT).
const TEST_SEGMENT = /(^|\/)(\w*tests?|androidtest|uitests|spec|__tests__)(\/|$)/i;

/**
 * The zone a density puts an area in.
 * @param {number} density weighted findings per file
 * @returns {string} a RISK_ZONE
 */
export function zoneOf(density) {
  if (density >= FIX_FIRST_DENSITY) return RISK_ZONE.FIX_FIRST;
  return density >= WATCH_DENSITY ? RISK_ZONE.WATCH : RISK_ZONE.HEALTHY;
}

/** Whether a path is a test file, as the Map's areas tell one. */
export function isTestPath(path) {
  return TEST_SEGMENT.test(path || '');
}

/** What one violation of `severity` weighs: a severity the formula does not know weighs as a minor one. */
export function severityWeight(severity) {
  return SEVERITY_WEIGHTS[Object.hasOwn(SEVERITY_WEIGHTS, severity) ? severity : SEVERITY.MINOR];
}

/**
 * The files an area is judged on: its production files, or every file when
 * it holds nothing but tests.
 * @param {Iterable<string>} paths the area's files
 * @returns {Set<string>}
 */
export function judgedFiles(paths) {
  const all = [...paths];
  const prod = all.filter((p) => !isTestPath(p));
  return new Set(prod.length ? prod : all);
}
