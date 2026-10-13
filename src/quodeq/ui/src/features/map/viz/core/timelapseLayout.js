import { packEnclose } from 'd3-hierarchy';
import { packSlim, XYR_STRIDE, XYR_Y as Y, XYR_R as R } from './packLayout.js';
import { SIBLING_GAP_SCALE, SIBLING_GAP_MIN, FOLDER_MARGIN_SCALE, FOLDER_MARGIN_MIN } from './proportionalPack.js';
import { forNeighbourPairs } from './circleGrid.js';

/**
 * Per-run layouts for the time-lapse (spec 2.5): one whole-history pack is the
 * anchor; each run is laid out from it. A file absent from the run is never
 * hidden: it keeps a small reserved slot (drawn dotted). RELAX settles each
 * folder's children from their anchor offsets toward the folder centre (big
 * ones to the middle), which closes the holes left by files that shrank to
 * their slot, then wraps the folder around them, so a child never leaves its
 * parent. FIXED_SLOTS keeps every circle at its anchor place and only resizes
 * files. SCALED_SLOTS keeps every circle at its anchor place inside its
 * parent but scales each folder, with its whole subtree, by its content in
 * the run, so folders grow and shrink and their content drifts with them.
 * All return x, y, r per node, with r > 0 for every node.
 *
 * A model is `{ parent: Int32Array (breadth-first, -1 at the root),
 * sizes: Float32Array[] (per run, per node: a leaf's checks, 0 = absent),
 * maxSize: Float32Array (per node: a leaf's largest checks, at least 1) }`.
 */
export const LAYOUT_MODE = Object.freeze({ RELAX: 'relax', FIXED_SLOTS: 'fixed-slots', SCALED_SLOTS: 'scaled-slots' });
/** The layout the app plays back: scaled slots, whose invariants hold by construction. */
export const TIMELAPSE_LAYOUT_MODE = LAYOUT_MODE.SCALED_SLOTS;
/** More than this share of files appearing or leaving between two runs cross-fades instead of moving. */
export const CROSSFADE_CHURN = 0.2;

/** The reserved slot of a file absent from a run, in √checks units (a present file is at least 1). */
export const ABSENT_LEAF_RADIUS = 0.5;
/** Scaled slots: the smallest share of its anchor radius a folder keeps, so one of absent files stays visible. */
export const MIN_FOLDER_SCALE = 0.2;
const PULL_BASE = 0.004;     // every child drifts gently toward the folder centre
const PULL_SIZE = 0.05;      // big children are pulled harder, so they take the middle
const PULL_EXP = 1.2;
const RELAX_ITERATIONS = 40;
const SETTLE_PASSES = 12;
const ALL_PAIRS_MAX = 48;    // smaller sibling groups check every pair; larger ones use the grid
const NUDGE = 1e-6;

const childCache = new WeakMap();

/** Children of every node, in node order (cached per parent array). */
function childLists(parent) {
  let lists = childCache.get(parent);
  if (lists) return lists;
  lists = Array.from(parent, () => []);
  for (let i = 1; i < parent.length; i++) lists[parent[i]].push(i);
  childCache.set(parent, lists);
  return lists;
}

/** The slim tree `packSlim` packs: a leaf's value is its largest checks over history. */
function slimOf(model) {
  const kids = childLists(model.parent);
  const build = (i) => (kids[i].length ? { v: 0, c: kids[i].map(build) } : { v: Math.max(1, model.maxSize[i]) });
  return build(0);
}

/**
 * The whole-history layout: our proportional pack of every file ever seen.
 * @param {{parent: Int32Array, maxSize: Float32Array}} model
 * @returns {Float32Array} x, y, r per node
 */
export function anchorLayout(model) {
  return Float32Array.from(packSlim(slimOf(model)));
}

/** Layout units per unit of √checks: a leaf's anchor radius over √(its anchor value). */
function leafScale(model, anchor) {
  const leaf = childLists(model.parent).findIndex((k) => k.length === 0);
  return anchor[leaf * XYR_STRIDE + R] / Math.sqrt(Math.max(1, model.maxSize[leaf]));
}

function separate(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const overlap = a.r + b.r - d;
  if (overlap <= 0) return;
  if (d < NUDGE) { dx = NUDGE; dy = 0; d = NUDGE; }
  const share = (b.r * b.r) / (a.r * a.r + b.r * b.r);   // the smaller circle gives way more
  const ux = dx / d;
  const uy = dy / d;
  a.x -= ux * overlap * share; a.y -= uy * overlap * share;
  b.x += ux * overlap * (1 - share); b.y += uy * overlap * (1 - share);
}

function collide(slots) {
  if (slots.length <= ALL_PAIRS_MAX) {
    for (let p = 0; p < slots.length; p++) for (let q = p + 1; q < slots.length; q++) separate(slots[p], slots[q]);
    return;
  }
  forNeighbourPairs(slots, 0, (p, q) => separate(slots[p], slots[q]));
}

/** Pull toward the folder centre (0, 0), harder for big slots, then push apart until nothing overlaps. */
function relaxGroup(slots) {
  if (slots.length < 2) return;
  const maxR = slots.reduce((m, s) => Math.max(m, s.r), 0);
  const pulls = slots.map((s) => PULL_SIZE * (s.r / maxR) ** PULL_EXP + PULL_BASE);
  for (let it = 0; it < RELAX_ITERATIONS; it++) {
    slots.forEach((s, j) => { s.x -= s.x * pulls[j]; s.y -= s.y * pulls[j]; });
    collide(slots);
  }
  for (let it = 0; it < SETTLE_PASSES; it++) collide(slots);
}

/** Settle folder `i`'s children and return its radius; offsets land in `geo` (unscaled units). */
function settleFolder(present, { i, geo, anchor, scale }) {
  const ax = anchor[i * XYR_STRIDE];
  const ay = anchor[i * XYR_STRIDE + Y];
  const slots = present.map((c) => ({
    x: (anchor[c * XYR_STRIDE] - ax) / scale,
    y: (anchor[c * XYR_STRIDE + Y] - ay) / scale,
    r: geo.r[c] * SIBLING_GAP_SCALE + SIBLING_GAP_MIN,
  }));
  relaxGroup(slots);
  const hull = packEnclose(slots);
  present.forEach((c, j) => { geo.ox[c] = slots[j].x - hull.x; geo.oy[c] = slots[j].y - hull.y; });
  return hull.r * FOLDER_MARGIN_SCALE + FOLDER_MARGIN_MIN;
}

/** Place every node top-down from the fixed root centre. */
function placeRun(model, anchor, geo, scale) {
  const out = new Float32Array(model.parent.length * XYR_STRIDE);
  const s = scale * Math.min(1, anchor[R] / Math.max(geo.r[0] * scale, NUDGE));  // never larger than the whole history
  out[0] = anchor[0];
  out[Y] = anchor[Y];
  out[R] = geo.r[0] * s;
  for (let i = 1; i < model.parent.length; i++) {
    const o = i * XYR_STRIDE;
    const p = model.parent[i] * XYR_STRIDE;
    out[o] = out[p] + geo.ox[i] * s;
    out[o + Y] = out[p + Y] + geo.oy[i] * s;
    out[o + R] = geo.r[i] * s;
  }
  return out;
}

/** A file's unscaled radius in a run: the root of its checks, or the small reserved size when it is absent. */
function leafRadius(size) {
  return size > 0 ? Math.sqrt(Math.max(1, size)) : ABSENT_LEAF_RADIUS;
}

function relaxedRun(model, anchor, k) {
  const kids = childLists(model.parent);
  const n = model.parent.length;
  const geo = { r: new Float64Array(n), ox: new Float64Array(n), oy: new Float64Array(n) };
  const scale = leafScale(model, anchor);
  const size = model.sizes[k];
  for (let i = n - 1; i >= 0; i--) {
    if (kids[i].length === 0) geo.r[i] = leafRadius(size[i]);
    else geo.r[i] = settleFolder(kids[i], { i, geo, anchor, scale });
  }
  return placeRun(model, anchor, geo, scale);
}

function fixedSlotsRun(model, anchor, k) {
  const kids = childLists(model.parent);
  const scale = leafScale(model, anchor);
  const size = model.sizes[k];
  const out = Float32Array.from(anchor);
  for (let i = 0; i < model.parent.length; i++) {
    if (kids[i].length) continue;
    const o = i * XYR_STRIDE + R;
    out[o] = Math.min(anchor[o], leafRadius(size[i]) * scale);
  }
  return out;
}

/** Per node, the sum of `leafArea(i)` over the files under it (children follow their parent in node order). */
function contentPerNode(model, leafArea) {
  const kids = childLists(model.parent);
  const out = Float64Array.from(model.parent, (_, i) => (kids[i].length ? 0 : leafArea(i)));
  for (let i = out.length - 1; i > 0; i--) out[model.parent[i]] += out[i];
  return out;
}

const fullCache = new WeakMap();

/**
 * Run `k`'s content per node: the sum of its files' squared radii in √checks
 * units, an absent file at its reserved slot (what scaled slots scale by).
 * @returns {Float64Array} one value per node
 */
export function runContent(model, k) {
  return contentPerNode(model, (i) => leafRadius(model.sizes[k][i]) ** 2);
}

/** Per node, how many of its files are in run `k`. */
const presentFiles = (model, k) => contentPerNode(model, (i) => (model.sizes[k][i] > 0 ? 1 : 0));

/**
 * Per node, the content it is drawn full size at: its content in the latest
 * run (today) when it has a file there, else its largest in any run (cached
 * per history).
 */
function fullContent(model) {
  let full = fullCache.get(model.sizes);
  if (full) return full;
  const latest = model.sizes.length - 1;
  full = runContent(model, latest);
  const today = presentFiles(model, latest);
  for (let k = 0; k < latest; k++) {
    const run = runContent(model, k);
    for (let i = 0; i < full.length; i++) if (!today[i] && run[i] > full[i]) full[i] = run[i];
  }
  fullCache.set(model.sizes, full);
  return full;
}

/**
 * Scaled slots. A folder's scale is S = min(S of its parent,
 * max(MIN_FOLDER_SCALE, √(run content / full content))), capped at 1 for the
 * root. Content is the sum of its files' squared radii (an absent file at its
 * reserved slot, so area follows checks run); full content is its content
 * today (the latest run) when it has a file today, so the latest run is the
 * anchor and hands back to today's map without a jump, and its largest in any
 * run when it is gone by today. A run bigger than today fills the anchor.
 * MIN_FOLDER_SCALE is a deliberate floor for the root too: a run with less
 * than 4 % of today's content (or a folder of absent files) stays a small
 * visible circle instead of a dot.
 * A node sits at its anchor offset from its parent times the parent's S,
 * from the parent's run centre; a folder's radius is its anchor radius times
 * its own S, a file's its run radius in √checks units times its parent's S.
 * Each child's circle is its anchor circle relative to the parent, scaled by
 * the parent's S and then shrunk in place (own S <= parent's S, run size <=
 * largest size), so the anchor's containment and sibling gaps carry over:
 * nothing leaves its parent, no siblings overlap, and no circle outgrows its
 * anchor (every S <= 1).
 */
function scaledSlotsRun(model, anchor, k) {
  const kids = childLists(model.parent);
  const unit = leafScale(model, anchor);
  const size = model.sizes[k];
  const run = runContent(model, k);
  const full = fullContent(model);
  // The root's parent is a virtual one at scale 1, centred where the anchor is.
  const scale = new Float64Array(model.parent.length + 1).fill(1);
  const out = new Float32Array(model.parent.length * XYR_STRIDE);
  out.set(anchor.subarray(0, R));
  for (let i = 0; i < model.parent.length; i++) {
    const o = i * XYR_STRIDE;
    const p = model.parent[i] * XYR_STRIDE;
    const up = scale[model.parent[i] + 1];
    if (i > 0) {
      out[o] = out[p] + (anchor[o] - anchor[p]) * up;
      out[o + Y] = out[p + Y] + (anchor[o + Y] - anchor[p + Y]) * up;
    }
    if (kids[i].length === 0) { out[o + R] = leafRadius(size[i]) * unit * up; continue; }
    scale[i + 1] = Math.min(up, Math.max(MIN_FOLDER_SCALE, Math.sqrt(run[i] / full[i])));
    out[o + R] = anchor[o + R] * scale[i + 1];
  }
  return out;
}

const RUN_OF_MODE = { [LAYOUT_MODE.RELAX]: relaxedRun, [LAYOUT_MODE.FIXED_SLOTS]: fixedSlotsRun, [LAYOUT_MODE.SCALED_SLOTS]: scaledSlotsRun };

/**
 * Run `k`'s layout from the anchor.
 * @param {{parent: Int32Array, sizes: Float32Array[], maxSize: Float32Array}} model
 * @param {Float32Array} anchor anchorLayout(model)
 * @param {number} k run index
 * @param {string} [mode] a LAYOUT_MODE value
 * @returns {Float32Array} x, y, r per node (absent files at their reserved slot)
 */
export function runLayout(model, anchor, k, mode = TIMELAPSE_LAYOUT_MODE) {
  return (RUN_OF_MODE[mode] || relaxedRun)(model, anchor, k);
}

/**
 * Share of files present in run `a` or `b` but not both.
 * @returns {number} 0..1
 */
export function fileChurn(model, a, b) {
  const kids = childLists(model.parent);
  const sa = model.sizes[a];
  const sb = model.sizes[b];
  let union = 0;
  let changed = 0;
  for (let i = 0; i < sa.length; i++) {
    if (kids[i].length) continue;
    const inA = sa[i] > 0;
    const inB = sb[i] > 0;
    if (inA || inB) union++;
    if (inA !== inB) changed++;
  }
  return union ? changed / union : 0;
}
