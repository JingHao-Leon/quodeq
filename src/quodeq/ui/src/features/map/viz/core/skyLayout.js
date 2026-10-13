import { TAU } from './galaxyCore.js';
import { clamp } from './mapBadness.js';

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
const FIT_TRIES = 6;
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
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) pushApart(nodes[i], nodes[j]);
    pullInside(nodes);
  }
}

const fits = (nodes) => nodes.every((n) => Math.hypot(n.x, n.y) + n.r <= SKY_RIM + SLACK);

function separated(nodes) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < nodes[i].r + nodes[j].r) return false;
  }
  return true;
}

function pullInside(nodes) {
  for (const n of nodes) {
    const d = Math.hypot(n.x, n.y);
    const max = SKY_RIM - n.r;
    if (d > max && d > 0) { n.x *= max / d; n.y *= max / d; }
  }
}

/**
 * Positions for the Risk sky: each area pulled to its need ring at its own
 * angle, pushed off its neighbours, shrunk until everything fits the rim.
 * @param {{name: string, needPct: number, stats: {files: number}}[]} areas
 * @returns {{x: number, y: number, r: number}[]} same order, sky-radius units
 */
export function layoutSky(areas) {
  let scale = 1;
  let nodes = [];
  for (let attempt = 0; attempt < FIT_TRIES; attempt++) {
    nodes = areas.map((a) => ({ ...targetOf(a), r: bubbleRadius(a.stats.files) * scale }));
    for (const n of nodes) { n.x = n.tx; n.y = n.ty; }
    relax(nodes);
    if (fits(nodes) && separated(nodes)) break;
    scale *= FIT_SHRINK;
  }
  pullInside(nodes);
  return nodes.map(({ x, y, r }) => ({ x, y, r }));
}
