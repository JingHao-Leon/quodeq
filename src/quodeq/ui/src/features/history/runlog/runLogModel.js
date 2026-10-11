import { abbrevDim } from '../utils/dimAbbrev.js';

const ORIGIN_KIND = { CI: 'ci', APP: 'app', CLI: 'cli' };
const SEV_ORDER = { critical: 0, major: 1, minor: 2 };
const SEV_UNKNOWN = 3; // sorts after every known severity

export const STRIP_RUNS = 20;
export const STRIP_PAGE = 10;
const SAME_SCORE_EPSILON = 0.05;

// Outliers: everything above the first big gap in the values (a value more
// than OUTLIER_GAP x the next one down) is clipped with a break mark, so one
// full re-analysis does not flatten the other runs. Below the gap: linear.
const OUTLIER_GAP = 3;
const OUTLIER_FLOOR = 10;

export function originLabel(origin) {
  if (!origin) return null;
  if (origin.kind === ORIGIN_KIND.CI) {
    if (Number.isInteger(origin.pr)) return `PR #${origin.pr}`;
    if (/nightly/i.test(origin.workflow || '')) return 'nightly';
    return origin.workflow || 'ci';
  }
  if (origin.kind === ORIGIN_KIND.APP) return 'app';
  if (origin.kind === ORIGIN_KIND.CLI) return 'cli';
  return null;
}

export function originUrl(origin) {
  return origin?.prUrl || origin?.runUrl || null;
}

/** A score equal to its baseline run's: shown muted, so changes stand out. */
export function isSameScore(run, runsById) {
  const base = run.baselineRunId ? runsById.get(run.baselineRunId) : null;
  return Boolean(base) && Number.isFinite(run.score) && Math.abs(run.score - base.score) < SAME_SCORE_EPSILON;
}

/** `6 dims` for a full run, the dimension short names for a partial one. */
export function scopeLabel(run, t) {
  return run.partial ? run.dims.map(abbrevDim).join(' · ') : t('history.scopeDims', { count: run.dims.length });
}

/** First row of the strip window: centred on the selection, kept in range. */
export function stripStart(rows, selectedId, size) {
  const i = Math.max(0, rows.findIndex((r) => r.runId === selectedId));
  return Math.min(Math.max(0, i - Math.floor(size / 2)), Math.max(0, rows.length - size));
}

export function scaleMax(values) {
  const v = [...new Set(values.filter((x) => x > 0))].sort((a, b) => b - a);
  if (!v.length) return { max: 1, cap: Infinity };
  for (let i = 0; i < v.length - 1; i++) {
    if (v[i] > OUTLIER_GAP * v[i + 1] && v[i + 1] >= OUTLIER_FLOOR) return { max: v[i + 1], cap: v[i + 1] };
  }
  return { max: v[0], cap: Infinity };
}

export function countBy(rows, key) {
  const m = new Map();
  rows.forEach((r) => { if (r[key]) m.set(r[key], (m.get(r[key]) || 0) + 1); });
  return [...m.entries()].sort((x, y) => y[1] - x[1]);
}

/** The run diff payload folded into what the log shows. */
export function summariseDiff(payload) {
  if (!payload?.dimensions) return null;
  const out = { new: [], resolved: [], unchecked: 0, perDim: {} };
  Object.entries(payload.dimensions).forEach(([dim, e]) => {
    const c = e.counts || {};
    out.perDim[dim] = { new: c.new || 0, resolved: c.resolved || 0, unchecked: c.notReevaluated || 0 };
    out.unchecked += c.notReevaluated || 0;
    (e.new || []).forEach((f) => out.new.push({ ...f, dimension: dim }));
    (e.resolved || []).forEach((f) => out.resolved.push({ ...f, dimension: dim }));
  });
  const bySev = (a, b) => (SEV_ORDER[a.severity] ?? SEV_UNKNOWN) - (SEV_ORDER[b.severity] ?? SEV_UNKNOWN)
    || a.dimension.localeCompare(b.dimension) || (a.file || '').localeCompare(b.file || '');
  out.new.sort(bySev);
  out.resolved.sort(bySev);
  const sev = (list) => list.reduce((m, f) => ({ ...m, [f.severity]: (m[f.severity] || 0) + 1 }), {});
  out.newSev = sev(out.new);
  out.resolvedSev = sev(out.resolved);
  return out;
}
