import { TAU } from './galaxyCore.js';
import { clamp } from './mapBadness.js';
import { forNeighbourPairs } from './circleGrid.js';

/** Areas with fewer files than this get no bubble (spec 2.4). */
export const SKY_MIN_FILES = 5;
/** The sky's edge, in units of its radius. */
export const SKY_RIM = 0.95;
// Distance from the centre: densest at NEED_INNER, no findings at NEED_INNER + NEED_SPAN.
const NEED_INNER = 0.12;
const NEED_SPAN = 0.72;
/** "Fix first" ring, weighted findings per file: mirrors FLOOR_HOTSPOT in core/map_history/area_metrics.py. */
export const FIX_FIRST_DENSITY = 0.75;
/** "Watch" ring, weighted findings per file: mirrors FLOOR_DORMANT in core/map_history/area_metrics.py. */
export const WATCH_DENSITY = 0.5;
const R_BASE = 0.014;
const R_PER_SQRT_FILE = 0.0068;
const GAP = 0.012;             // empty space kept between neighbouring bubbles
const PULL = 0.12;             // share of the way back to its target per step
const ITERATIONS = 260;
const ANCHORED_ITERATIONS = 80; // a run that starts from the run before needs fewer steps
const FIT_SHRINK = 0.85;       // radii shrink by this when the sky overflows
const MAX_TRIES = 16;        // shrink steps before settling for the least-overlapping attempt
const MAX_FILL = 0.55;       // share of the sky the padded bubbles may cover before relaxing
const NUDGE = 1e-4;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const UINT32 = 4294967296;
const HALF = 0.5;
const SLACK = 1e-9;

/**
 * The share of the areas the scale top covers: one extreme area cannot push
 * every other area to the rim, it sits at the centre with the top's own.
 */
export const SKY_TOP_PERCENTILE = 0.9;

/** The p-quantile of ascending values, interpolated between the two nearest ranks. */
function quantile(sorted, p) {
  const at = (sorted.length - 1) * p;
  const below = Math.floor(at);
  const above = Math.min(sorted.length - 1, below + 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

/**
 * The density the sky's scale tops out at: the SKY_TOP_PERCENTILE of the
 * areas' densities, never below the fix-first floor, so a clean project keeps
 * its areas off the centre. Areas above it sit at the innermost distance.
 * @param {{density: number}[]} areas
 * @returns {number} weighted findings per file
 */
export function densityTop(areas) {
  if (!areas.length) return FIX_FIRST_DENSITY;
  const sorted = areas.map((a) => a.density || 0).sort((a, b) => a - b);
  return Math.max(FIX_FIRST_DENSITY, quantile(sorted, SKY_TOP_PERCENTILE));
}

/**
 * How far from the centre an area with this density sits. The square root
 * spreads the many low-density areas across the outer half instead of
 * stacking them on the rim, and still compresses a heavy tail. A density
 * above the top is clamped to it: the innermost distance, never beyond.
 * @param {number} density weighted findings per file
 * @param {number} top densityTop of the project
 * @returns {number} distance in sky-radius units
 */
export function densityDistance(density, top) {
  const reach = Math.sqrt(clamp(density / top, 0, 1));
  return NEED_INNER + (1 - reach) * NEED_SPAN;
}

/**
 * Where the "fix first" and "watch" rings fall under a scale top.
 * @param {number} top densityTop of the areas on the sky
 * @returns {{fixFirst: number, watch: number}} distances in sky-radius units
 */
export function ringsAt(top) {
  return { fixFirst: densityDistance(FIX_FIRST_DENSITY, top), watch: densityDistance(WATCH_DENSITY, top) };
}

/**
 * Where the "fix first" and "watch" rings fall for these areas: they follow
 * the project, close to the centre when it is clean, wide when it is not.
 * @param {{density: number}[]} areas
 * @returns {{fixFirst: number, watch: number}} distances in sky-radius units
 */
export function skyRings(areas) {
  return ringsAt(densityTop(areas));
}

/**
 * A bubble's radius from its file count.
 * @param {number} files file count
 * @returns {number} radius in sky-radius units
 */
export function bubbleRadius(files) {
  return R_BASE + Math.sqrt(Math.max(0, files)) * R_PER_SQRT_FILE;
}

/**
 * A stable angle per area name (FNV-1a), so an area keeps its direction across runs.
 * @param {string} name area name
 * @returns {number} angle in radians
 */
export function seededAngle(name) {
  let h = FNV_OFFSET;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), FNV_PRIME);
  return ((h >>> 0) / UINT32) * TAU;
}

function targetOf(area, top) {
  const angle = seededAngle(area.name);
  const d = densityDistance(area.density || 0, top);
  return { tx: Math.cos(angle) * d, ty: Math.sin(angle) * d };
}

function pushApart(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  if (dist === 0) { dx = NUDGE; dy = 0; dist = NUDGE; }
  const overlap = a.r + b.r + GAP - dist;
  if (overlap <= 0) return;
  const ux = dx / dist;
  const uy = dy / dist;
  a.x -= ux * overlap * HALF; a.y -= uy * overlap * HALF;
  b.x += ux * overlap * HALF; b.y += uy * overlap * HALF;
}

function relax(nodes, iterations) {
  for (let step = 0; step < iterations; step++) {
    const pull = PULL * (1 - step / iterations); // fades out so the last steps only separate
    for (const n of nodes) { n.x += (n.tx - n.x) * pull; n.y += (n.ty - n.y) * pull; }
    forNeighbourPairs(nodes, GAP, (i, j) => pushApart(nodes[i], nodes[j]));
    pullInside(nodes);
  }
}

/** Total depth by which bubbles overlap each other or cross the rim; 0 means a clean sky. */
function overlapOf(nodes) {
  let total = 0;
  for (const n of nodes) total += Math.max(0, Math.hypot(n.x, n.y) + n.r - SKY_RIM - SLACK);
  forNeighbourPairs(nodes, GAP, (i, j) => {
    const a = nodes[i];
    const b = nodes[j];
    total += Math.max(0, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
  });
  return total;
}

function pullInside(nodes) {
  for (const n of nodes) {
    const d = Math.hypot(n.x, n.y);
    const max = SKY_RIM - n.r;
    if (d > max && d > 0) { n.x *= max / d; n.y *= max / d; }
  }
}

/** Largest scale (a power of FIT_SHRINK) at which the gap-padded bubbles fill at most MAX_FILL of the sky. */
function startScale(areas) {
  const skyArea = SKY_RIM * SKY_RIM;
  const fill = (scale) => areas.reduce((sum, a) => sum + (bubbleRadius(a.stats.files) * scale + GAP * HALF) ** 2, 0) / skyArea;
  let scale = 1;
  for (let i = 0; i < MAX_TRIES && fill(scale) > MAX_FILL; i++) scale *= FIT_SHRINK;
  return scale;
}

function attemptAt(areas, scale, { top, start, iterations }) {
  const nodes = areas.map((a) => ({ ...targetOf(a, top), r: bubbleRadius(a.stats.files) * scale }));
  nodes.forEach((n, i) => {
    const from = start?.get(areas[i].name);
    n.x = from ? from.x : n.tx;
    n.y = from ? from.y : n.ty;
  });
  relax(nodes, iterations);
  pullInside(nodes);
  return { nodes, overlap: overlapOf(nodes) };
}

function bestLayout(areas, options) {
  let scale = startScale(areas);
  let best = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const tried = attemptAt(areas, scale, options);
    if (!best || tried.overlap < best.overlap) best = tried;
    if (tried.overlap === 0) break;
    scale *= FIT_SHRINK;
  }
  return (best ? best.nodes : []).map(({ x, y, r }) => ({ x, y, r }));
}

/**
 * Positions for the Risk sky: each area pulled to its density ring at its own
 * angle, pushed off its neighbours, shrunk until nothing overlaps and
 * everything fits the rim. If no scale within MAX_TRIES is clean, the
 * attempt with the least total overlap wins.
 * @param {{name: string, density: number, stats: {files: number}}[]} areas
 * @param {number} [top] the scale top; defaults to these areas' own densityTop
 * @returns {{x: number, y: number, r: number}[]} same order, sky-radius units
 */
export function layoutSky(areas, top = densityTop(areas)) {
  return bestLayout(areas, { top, start: null, iterations: ITERATIONS });
}

/**
 * The sky of a run that follows another: every area starts where it was
 * (`previous`, by name; new areas at their target) and settles from there,
 * so bubbles drift instead of jumping.
 * @param {{name: string, density: number, stats: {files: number}}[]} areas as for layoutSky
 * @param {Map<string, {x: number, y: number}>} previous the run before's positions, by area name
 * @param {number} [top] the scale top; defaults to these areas' own densityTop
 * @returns {{x: number, y: number, r: number}[]} same order, sky-radius units
 */
export function layoutSkyFrom(areas, previous, top = densityTop(areas)) {
  return bestLayout(areas, { top, start: previous, iterations: ANCHORED_ITERATIONS });
}

/**
 * The areas of a set that get a bubble: at least SKY_MIN_FILES files.
 * @param {{areas: {stats: {files: number}}[]}} areaSet decodeAreas or areaSetAt output
 * @returns {object[]} the bubble areas, in the set's order
 */
export function skyAreas(areaSet) {
  return areaSet.areas.filter((a) => a.stats.files >= SKY_MIN_FILES);
}
