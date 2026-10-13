import { TAU } from './galaxyCore.js';
import { clamp } from './mapBadness.js';

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
const FIT_SHRINK = 0.85;       // radii shrink by this when the sky overflows
const MAX_TRIES = 16;        // shrink steps before settling for the least-overlapping attempt
const MAX_FILL = 0.55;       // share of the sky the padded bubbles may cover before relaxing
const GRID_STRIDE = 65536;   // packs a cell's column and row into one Map key
const NUDGE = 1e-4;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const UINT32 = 4294967296;
const HALF = 0.5;
const SLACK = 1e-9;

/**
 * The density the sky's scale tops out at: the project's densest area, never
 * below the fix-first floor, so a clean project keeps its areas off the centre.
 * @param {{density: number}[]} areas
 * @returns {number} weighted findings per file
 */
export function densityTop(areas) {
  return areas.reduce((top, a) => Math.max(top, a.density || 0), FIX_FIRST_DENSITY);
}

/**
 * How far from the centre an area with this density sits. The square root
 * spreads the many low-density areas across the outer half instead of
 * stacking them on the rim, and still compresses a heavy tail.
 * @param {number} density weighted findings per file
 * @param {number} top densityTop of the project
 * @returns {number} distance in sky-radius units
 */
export function densityDistance(density, top) {
  const reach = Math.sqrt(clamp(density / top, 0, 1));
  return NEED_INNER + (1 - reach) * NEED_SPAN;
}

/**
 * Where the "fix first" and "watch" rings fall for these areas: they follow
 * the project, close to the centre when it is clean, wide when it is not.
 * @param {{density: number}[]} areas
 * @returns {{fixFirst: number, watch: number}} distances in sky-radius units
 */
export function skyRings(areas) {
  const top = densityTop(areas);
  return { fixFirst: densityDistance(FIX_FIRST_DENSITY, top), watch: densityDistance(WATCH_DENSITY, top) };
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

/** Cell size for the neighbour grid: twice the median radius plus the gap. */
function cellSize(nodes) {
  const radii = nodes.map((n) => n.r).sort((p, q) => p - q);
  return 2 * (radii[Math.floor(radii.length * HALF)] || 0) + GAP;
}

/**
 * Uniform grid over the nodes' gap-padded boxes. A big bubble sits in every
 * cell its box covers, so the cell size can follow the typical bubble.
 */
function buildGrid(nodes, cell) {
  const cells = new Map();
  const spans = nodes.map((n) => {
    const reach = n.r + GAP;
    return {
      x0: Math.floor((n.x - reach) / cell), x1: Math.floor((n.x + reach) / cell),
      y0: Math.floor((n.y - reach) / cell), y1: Math.floor((n.y + reach) / cell),
    };
  });
  spans.forEach((sp, i) => {
    for (let cx = sp.x0; cx <= sp.x1; cx++) for (let cy = sp.y0; cy <= sp.y1; cy++) {
      const key = cx * GRID_STRIDE + cy;
      const list = cells.get(key);
      if (list) list.push(i); else cells.set(key, [i]);
    }
  });
  return { cells, spans };
}

/** True when this cell is the first one both spans share, so a pair is visited once. */
function ownsPair(key, a, b) {
  return key === Math.max(a.x0, b.x0) * GRID_STRIDE + Math.max(a.y0, b.y0);
}

/** Calls visit(i, j) once for every pair of nodes whose padded boxes share a cell. */
function forNeighbours(nodes, visit) {
  const { cells, spans } = buildGrid(nodes, cellSize(nodes));
  for (const [key, list] of cells) {
    for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      if (ownsPair(key, spans[list[p]], spans[list[q]])) visit(list[p], list[q]);
    }
  }
}

function relax(nodes) {
  for (let step = 0; step < ITERATIONS; step++) {
    const pull = PULL * (1 - step / ITERATIONS); // fades out so the last steps only separate
    for (const n of nodes) { n.x += (n.tx - n.x) * pull; n.y += (n.ty - n.y) * pull; }
    forNeighbours(nodes, (i, j) => pushApart(nodes[i], nodes[j]));
    pullInside(nodes);
  }
}

/** Total depth by which bubbles overlap each other or cross the rim; 0 means a clean sky. */
function overlapOf(nodes) {
  let total = 0;
  for (const n of nodes) total += Math.max(0, Math.hypot(n.x, n.y) + n.r - SKY_RIM - SLACK);
  forNeighbours(nodes, (i, j) => {
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

function attemptAt(areas, scale, top) {
  const nodes = areas.map((a) => ({ ...targetOf(a, top), r: bubbleRadius(a.stats.files) * scale }));
  for (const n of nodes) { n.x = n.tx; n.y = n.ty; }
  relax(nodes);
  pullInside(nodes);
  return { nodes, overlap: overlapOf(nodes) };
}

/**
 * Positions for the Risk sky: each area pulled to its density ring at its own
 * angle, pushed off its neighbours, shrunk until nothing overlaps and
 * everything fits the rim. If no scale within MAX_TRIES is clean, the
 * attempt with the least total overlap wins.
 * @param {{name: string, density: number, stats: {files: number}}[]} areas
 * @returns {{x: number, y: number, r: number}[]} same order, sky-radius units
 */
export function layoutSky(areas) {
  const top = densityTop(areas);
  let scale = startScale(areas);
  let best = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const tried = attemptAt(areas, scale, top);
    if (!best || tried.overlap < best.overlap) best = tried;
    if (tried.overlap === 0) break;
    scale *= FIT_SHRINK;
  }
  return (best ? best.nodes : []).map(({ x, y, r }) => ({ x, y, r }));
}
