/**
 * A run compared with its baseline run (GET runs/{run}/diff?against=...),
 * folded for the History run log and the run page: the new and fixed
 * findings (most severe first) and, per dimension, their counts and
 * severities. Pure functions, no framework imports.
 */
import { SEVERITY } from '../vocab/severity.js';

const SEV_ORDER = { [SEVERITY.CRITICAL]: 0, [SEVERITY.MAJOR]: 1, [SEVERITY.MINOR]: 2 };
const SEV_UNKNOWN = 3; // sorts after every known severity

/** Most severe first, then by dimension and file. */
const bySeverity = (a, b) => (SEV_ORDER[a.severity] ?? SEV_UNKNOWN) - (SEV_ORDER[b.severity] ?? SEV_UNKNOWN)
  || a.dimension.localeCompare(b.dimension) || (a.file || '').localeCompare(b.file || '');

/** Findings per severity. */
const severityTally = (list) => {
  const tally = {};
  for (const f of list) tally[f.severity] = (tally[f.severity] || 0) + 1;
  return tally;
};

/** One dimension's counts: new, fixed, not re-evaluated, and the new and fixed per severity. */
function dimensionChange(entry) {
  const c = entry.counts || {};
  return { new: c.new || 0, resolved: c.resolved || 0, unchecked: c.notReevaluated || 0, newSev: c.newSev || {}, resolvedSev: c.resolvedSev || {} };
}

/**
 * The run diff payload folded into what the run log and the run page show;
 * null without one.
 * @param {?{dimensions?: object}} payload
 * @returns {?{new: object[], resolved: object[], unchecked: number, perDim: object, newSev: object, resolvedSev: object}}
 */
export function summariseDiff(payload) {
  if (!payload?.dimensions) return null;
  const out = { new: [], resolved: [], unchecked: 0, perDim: {} };
  Object.entries(payload.dimensions).forEach(([dim, e]) => {
    out.perDim[dim] = dimensionChange(e);
    out.unchecked += out.perDim[dim].unchecked;
    (e.new || []).forEach((f) => out.new.push({ ...f, dimension: dim }));
    (e.resolved || []).forEach((f) => out.resolved.push({ ...f, dimension: dim }));
  });
  out.new.sort(bySeverity);
  out.resolved.sort(bySeverity);
  out.newSev = severityTally(out.new);
  out.resolvedSev = severityTally(out.resolved);
  return out;
}
