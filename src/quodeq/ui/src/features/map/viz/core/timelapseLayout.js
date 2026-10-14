import { hierarchy } from 'd3-hierarchy';
import { packInPlace, XYR_STRIDE, XYR_Y as Y, XYR_R as R } from './packLayout.js';
import { settleFolder } from './timelapseSettle.js';

/**
 * Per-run layouts for the time-lapse (spec 2.5): every run shows only what it
 * holds. The base is today's own pack (the files of the latest run, sorted as
 * the Map sorts them), so the latest run is today's map. Every other run
 * starts from the base on its own, drops what it does not hold (radius 0, in
 * place, so it grows in or shrinks out) and settles each folder's children
 * toward the folder's centre, big ones harder, without overlapping; the
 * folder then wraps them with the Map's own spacing. Runs never depend on
 * each other, so small changes do not pile up over the history. A folder
 * holding only one folder is drawn as that folder (the Map's collapsed
 * chains, decided per run).
 *
 * A model is `{ parent: Int32Array (breadth-first, -1 at the root),
 * sizes: Float32Array[] (per run, per node: a leaf's checks, 0 = absent),
 * maxSize: Float32Array (per node: a leaf's largest checks, at least 1) }`.
 */

const GOLDEN_ANGLE = 2.399963;
/** A folder gone by today is parked at its children's area at this density, plus a margin. */
const PARKED_DENSITY = 0.6;
const PARKED_MARGIN = 0.6;
const PARK_SPREAD = 0.9;
const PARK_MIN_R = 0.3;
/** Spacing kept per folder: this share of the smallest margin and gap it had today. */
const SPACING_SHARE = 0.9;
const SPACING_PAIRS = 60;

const baseCache = new WeakMap();

function childLists(parent) {
  const lists = Array.from(parent, () => []);
  for (let i = 1; i < parent.length; i++) lists[parent[i]].push(i);
  return lists;
}

/** Which nodes hold a file in the latest run (a folder: any child that does). */
function liveNodes(model, kids) {
  const latest = model.sizes[model.sizes.length - 1];
  const live = new Uint8Array(model.parent.length);
  for (let i = live.length - 1; i >= 0; i--) {
    live[i] = (kids[i].length ? kids[i].some((c) => live[c]) : latest[i] > 0) ? 1 : 0;
  }
  return live;
}

/** Today's pack into `xyr` for the live nodes; returns the leaf scale (layout units per √checks). */
function packToday(model, kids, live, xyr) {
  const latest = model.sizes[model.sizes.length - 1];
  const chains = [];
  const build = (i) => {
    if (!kids[i].length) return { i, v: Math.max(1, latest[i]) };
    const present = kids[i].filter((c) => live[c]);
    if (i > 0 && present.length === 1 && kids[present[0]].length) {
      chains.push([i, present[0]]);
      return build(present[0]);
    }
    return { i, c: present.map(build) };
  };
  const root = hierarchy(build(0), (d) => d.c).sum((d) => (d.c ? 0 : d.v));
  root.sort((a, b) => (b.value || 0) - (a.value || 0));
  packInPlace(root);
  const scales = [];
  root.each((d) => {
    const o = d.data.i * XYR_STRIDE;
    xyr[o] = d.x; xyr[o + Y] = d.y; xyr[o + R] = d.r;
    if (!d.data.c) scales.push(d.r / Math.sqrt(d.data.v));
  });
  for (let a = chains.length - 1; a >= 0; a--) {
    const [wrapper, end] = chains[a];
    xyr.copyWithin(wrapper * XYR_STRIDE, end * XYR_STRIDE, end * XYR_STRIDE + XYR_STRIDE);
  }
  scales.sort((a, b) => a - b);
  return scales[Math.floor(scales.length / 2)] || 1;
}

/** Nodes gone by today: sized from their history, parked on a golden-angle spiral around their nearest live ancestor. */
function parkPastOnly(model, kids, live, xyr, unit) {
  const n = model.parent.length;
  for (let i = n - 1; i >= 0; i--) {
    if (live[i]) continue;
    const o = i * XYR_STRIDE;
    if (!kids[i].length) { xyr[o + R] = unit * Math.sqrt(Math.max(1, model.maxSize[i])); continue; }
    const area = kids[i].reduce((t, c) => t + xyr[c * XYR_STRIDE + R] ** 2, 0);
    xyr[o + R] = Math.sqrt(area / PARKED_DENSITY) + PARKED_MARGIN;
  }
  const slot = new Map();
  for (let i = 1; i < n; i++) {
    if (live[i]) continue;
    let a = model.parent[i];
    while (a > 0 && !live[a]) a = model.parent[a];
    const k = (slot.get(a) || 0) + 1;
    slot.set(a, k);
    const o = i * XYR_STRIDE;
    const ao = a * XYR_STRIDE;
    const dist = Math.sqrt(k) * Math.max(PARK_MIN_R, xyr[o + R]) * PARK_SPREAD;
    xyr[o] = xyr[ao] + Math.cos(k * GOLDEN_ANGLE) * dist;
    xyr[o + Y] = xyr[ao + Y] + Math.sin(k * GOLDEN_ANGLE) * dist;
  }
}

/** The smallest gap between a folder's first children in the base, a share of it kept (0 without two children). */
function keptGap(list, xyr) {
  let g = Infinity;
  for (let a = 0; a < list.length && a < SPACING_PAIRS; a++) {
    for (let b = a + 1; b < list.length && b < SPACING_PAIRS; b++) {
      const p = list[a] * XYR_STRIDE;
      const q = list[b] * XYR_STRIDE;
      g = Math.min(g, Math.hypot(xyr[p] - xyr[q], xyr[p + Y] - xyr[q + Y]) - xyr[p + R] - xyr[q + R]);
    }
  }
  return Number.isFinite(g) ? Math.max(0, g * SPACING_SHARE) : 0;
}

/** The margin between a folder's edge and its children in the base, a share of it kept as padding. */
function keptPad(i, list, xyr) {
  const o = i * XYR_STRIDE;
  let inner = Infinity;
  for (const c of list) {
    const co = c * XYR_STRIDE;
    inner = Math.min(inner, xyr[o + R] - (Math.hypot(xyr[co] - xyr[o], xyr[co + Y] - xyr[o + Y]) + xyr[co + R]));
  }
  return Number.isFinite(inner) ? Math.max(0, inner * SPACING_SHARE) : 0;
}

/** The base every run starts from (cached per model). */
function baseOf(model) {
  let base = baseCache.get(model.parent);
  if (base) return base;
  const kids = childLists(model.parent);
  const live = liveNodes(model, kids);
  const xyr = new Float64Array(model.parent.length * XYR_STRIDE);
  const unit = packToday(model, kids, live, xyr);
  parkPastOnly(model, kids, live, xyr, unit);
  base = {
    kids, live, xyr, unit,
    pad: Float64Array.from(kids, (list, i) => keptPad(i, list, xyr)),
    gap: Float64Array.from(kids, (list) => keptGap(list, xyr)),
  };
  baseCache.set(model.parent, base);
  return base;
}

/**
 * The anchor the client plays against: today's pack, with what is gone by
 * today at radius 0 where it is parked.
 * @param {{parent: Int32Array, sizes: Float32Array[], maxSize: Float32Array}} model
 * @returns {Float32Array} x, y, r per node
 */
export function anchorLayout(model) {
  const base = baseOf(model);
  const out = Float32Array.from(base.xyr);
  for (let i = 0; i < base.live.length; i++) if (!base.live[i]) out[i * XYR_STRIDE + R] = 0;
  return out;
}

/** A file's radius in a run: √checks in layout units, 0 when the run does not hold it. */
function fileRadius(size, unit) {
  return size > 0 ? unit * Math.sqrt(Math.max(1, size)) : 0;
}

/**
 * Run `k`'s layout: x, y, r per node. What the run does not hold has radius 0
 * where it would sit (its base offset from its parent), so it grows and
 * shrinks in place; the latest run is the anchor itself.
 * @param {{parent: Int32Array, sizes: Float32Array[], maxSize: Float32Array}} model
 * @param {number} k run index
 * @returns {Float32Array}
 */
export function runLayout(model, k) {
  if (k === model.sizes.length - 1) return anchorLayout(model);
  const base = baseOf(model);
  const n = model.parent.length;
  const { kids, xyr, unit } = base;
  const rad = new Float64Array(n);
  const ox = new Float64Array(n);
  const oy = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const o = i * XYR_STRIDE;
    const p = model.parent[i] * XYR_STRIDE;
    ox[i] = xyr[o] - xyr[p]; oy[i] = xyr[o + Y] - xyr[p + Y];
  }
  for (let i = n - 1; i >= 0; i--) {
    rad[i] = kids[i].length ? settleFolder(i, { base, rad, ox, oy }) : fileRadius(model.sizes[k][i], unit);
  }
  const out = new Float32Array(n * XYR_STRIDE);
  out[0] = xyr[0]; out[Y] = xyr[Y]; out[R] = rad[0];
  for (let i = 1; i < n; i++) {
    const o = i * XYR_STRIDE;
    const p = model.parent[i] * XYR_STRIDE;
    out[o] = out[p] + ox[i]; out[o + Y] = out[p + Y] + oy[i]; out[o + R] = rad[i];
  }
  return out;
}
