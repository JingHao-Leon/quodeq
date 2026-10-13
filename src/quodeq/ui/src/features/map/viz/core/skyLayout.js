import { TAU } from './galaxyCore.js';
import { clamp } from './mapBadness.js';
import { forNeighbourPairs } from './circleGrid.js';

/** Areas with fewer files than this get no bubble (spec 2.4). */
export const SKY_MIN_FILES = 5;
/** The sky's edge, in units of its radius. */
export const SKY_RIM = 0.95;
// Distance from the centre: most need at NEED_INNER, least at NEED_INNER + NEED_SPAN.
const NEED_INNER = 0.12;
const NEED_SPAN = 0.72;
const FIX_FIRST_NEED = 0.6;
const WATCH_NEED = 0.4;
const R_BASE = 0.014;
const R_PER_SQRT_FILE = 0.0068;
const GAP = 0.012;             // empty space kept between neighbouring bubbles
const PULL = 0.12;             // share of the way back to its target per step
const ITERATIONS = 260;
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
 * How far from the centre an area with this need percentile sits.
 * @param {number} needPct need percentile, 0..1
 * @returns {number} distance in sky-radius units
 */
export function needDistance(needPct) {
  return NEED_INNER + (1 - clamp(needPct, 0, 1)) * NEED_SPAN;
}

/** Ring distance for the "fix first" band label (need 0.6). */
export const RING_FIX_FIRST = needDistance(FIX_FIRST_NEED);
/** Ring distance for the "watch" band label (need 0.4). */
export const RING_WATCH = needDistance(WATCH_NEED);

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

function targetOf(area) {
  const angle = seededAngle(area.name);
  const d = needDistance(area.needPct);
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

function relax(nodes) {
  for (let step = 0; step < ITERATIONS; step++) {
    const pull = PULL * (1 - step / ITERATIONS); // fades out so the last steps only separate
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

function attemptAt(areas, scale) {
  const nodes = areas.map((a) => ({ ...targetOf(a), r: bubbleRadius(a.stats.files) * scale }));
  for (const n of nodes) { n.x = n.tx; n.y = n.ty; }
  relax(nodes);
  pullInside(nodes);
  return { nodes, overlap: overlapOf(nodes) };
}

/**
 * Positions for the Risk sky: each area pulled to its need ring at its own
 * angle, pushed off its neighbours, shrunk until nothing overlaps and
 * everything fits the rim. If no scale within MAX_TRIES is clean, the
 * attempt with the least total overlap wins.
 * @param {{name: string, needPct: number, stats: {files: number}}[]} areas
 * @returns {{x: number, y: number, r: number}[]} same order, sky-radius units
 */
export function layoutSky(areas) {
  let scale = startScale(areas);
  let best = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const tried = attemptAt(areas, scale);
    if (!best || tried.overlap < best.overlap) best = tried;
    if (tried.overlap === 0) break;
    scale *= FIT_SHRINK;
  }
  return (best ? best.nodes : []).map(({ x, y, r }) => ({ x, y, r }));
}
