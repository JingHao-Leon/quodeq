// src/quodeq/ui/src/features/map/viz/core/mapBadness.js
import { NODE_KIND } from '../../mapVocab.js';
import { SEVERITY_WEIGHTS } from '../../../../models/riskRules.js';

/** The grade formula's default severity weights, shared with the Findings headers (models/riskRules.js). */
export const DEFAULT_SEVERITY_WEIGHTS = SEVERITY_WEIGHTS;

const REL_LOG_SPAN = 1.6;          // log2(lift) / 1.6: about 3x the average reads as full strength
const MIN_LIFT = 0.01;
const POOR_RATE = 0.6;             // pass rates below 60 % add absolute red
const POOR_RATE_SPAN = 0.35;
const POOR_RATE_STRENGTH = 0.7;
const CRITICAL_BONUS = 0.15;
const PARENT_ABS_CAP = 0.25;       // a folder with sub-folders: a tint, never a flood
const CAP_CRITICAL = 1;
const CAP_MAJOR = 0.8;
const CAP_MINOR = 0.5;
const GOOD_RATE = 0.7;             // pass rates above 70 % pull toward better
const GOOD_RATE_SPAN = 0.25;
const GOOD_STRENGTH = 0.85;
const GOOD_PULL_BELOW = 0.15;      // only when the node is not clearly worse already
const PARENT_GOOD_FLOOR = -0.2;    // a big healthy parent: a tint, never a flood
const FILE_GOOD_FLOOR = -0.6;      // a file with violations never reads as clean
const EPSILON = 1e-9;

/**
 * |badness| at or below this reads as "about average": the neutral hue and the
 * spoken state both use it, so colour and text always agree.
 */
export const AVERAGE_BAND = 0.02;

/** `v` limited to `[lo, hi]`. */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Severity-weighted findings of a file-tree node (a file or a folder aggregate). */
export function nodeWeight(node, weights = DEFAULT_SEVERITY_WEIGHTS) {
  const s = node.severity || {};
  return (s.critical || 0) * weights.critical + (s.major || 0) * weights.major + (s.minor || 0) * weights.minor;
}

function relative(stats, average) {
  const lift = stats.weight / Math.max(1, stats.files) / Math.max(EPSILON, average);
  return clamp(Math.log2(Math.max(lift, MIN_LIFT)) / REL_LOG_SPAN, -1, 1);
}

function absolute(rate, hasCritical, isParent) {
  const raw = POOR_RATE_STRENGTH * clamp((POOR_RATE - rate) / POOR_RATE_SPAN, 0, 1) + (hasCritical ? CRITICAL_BONUS : 0);
  return isParent ? Math.min(raw, PARENT_ABS_CAP) : Math.min(1, raw);
}

function severityCap(stats) {
  if (stats.critical) return CAP_CRITICAL;
  return stats.major ? CAP_MAJOR : CAP_MINOR;
}

function goodPull(b, rate, hasCritical) {
  if (b >= GOOD_PULL_BELOW || hasCritical) return b;
  const good = -GOOD_STRENGTH * clamp((rate - GOOD_RATE) / GOOD_RATE_SPAN, 0, 1);
  return Math.min(b, good + Math.max(0, b));
}

/**
 * Badness in [-1, 1] (spec 2.1): positive = more issues than this project's
 * average for the node's size, negative = fewer. Capped by the worst finding.
 * @param {{violations:number, compliance:number, weight:number, files:number, critical:number, major:number}} stats
 * @param {number} average project severity weight per file
 * @param {string} kind one of NODE_KIND
 * @returns {number}
 */
export function badness(stats, average, kind) {
  if (!stats.violations) return stats.compliance ? -1 : 0;
  const rate = stats.compliance / Math.max(1, stats.compliance + stats.violations);
  const hasCritical = stats.critical > 0;
  const isParent = kind === NODE_KIND.PARENT;
  const raw = Math.max(relative(stats, average), absolute(rate, hasCritical, isParent));
  let b = goodPull(Math.min(raw, severityCap(stats)), rate, hasCritical);
  if (isParent) b = Math.max(b, PARENT_GOOD_FLOOR);
  return b < 0 && kind === NODE_KIND.FILE ? Math.max(b, FILE_GOOD_FLOOR) : b;
}
