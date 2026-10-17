import { TAU } from './galaxyCore.js';
import { forNeighbourPairs } from './circleGrid.js';
import { SKY_ZONE } from '../../mapVocab.js';
import { SKY_GAP as GAP, bubbleRadius, densityDistance, skyScale, zoneOf } from './skyScale.js';

/** Areas with fewer files than this get no bubble (spec 2.4). */
export const SKY_MIN_FILES = 5;
/** The sky's edge, in units of its radius. */
export const SKY_RIM = 0.95;
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
 * A stable angle per area name (FNV-1a), so an area keeps its direction across runs.
 * @param {string} name area name
 * @returns {number} angle in radians
 */
export function seededAngle(name) {
  let h = FNV_OFFSET;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), FNV_PRIME);
  return ((h >>> 0) / UINT32) * TAU;
}

function targetOf(area, scale) {
  const angle = seededAngle(area.name);
  const d = densityDistance(area.density || 0, scale);
  return { tx: Math.cos(angle) * d, ty: Math.sin(angle) * d };
}

/** The distances from the centre an area's zone spans under a scale. */
function bandOf(area, { fixFirst, watch }) {
  const zone = zoneOf(area.density || 0);
  if (zone === SKY_ZONE.FIX_FIRST) return { lo: 0, hi: fixFirst };
  return zone === SKY_ZONE.WATCH ? { lo: fixFirst, hi: watch } : { lo: watch, hi: SKY_RIM };
}

/**
 * Keep each bubble's centre inside its zone, half its radius clear of the
 * zone's lines where the band allows: a bubble may graze a ring, never sit
 * on the wrong side of it.
 */
function keepInBands(nodes) {
  for (const n of nodes) {
    const d = Math.hypot(n.x, n.y);
    const clear = Math.min(n.r * HALF, (n.hi - n.lo) * HALF);
    const lo = n.lo > 0 ? n.lo + clear : 0;
    const want = Math.min(Math.max(d, lo), n.hi - clear);
    if (want === d) continue;
    const ux = d > 0 ? n.x / d : Math.cos(Math.atan2(n.ty, n.tx));
    const uy = d > 0 ? n.y / d : Math.sin(Math.atan2(n.ty, n.tx));
    n.x = ux * want; n.y = uy * want;
  }
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
    keepInBands(nodes);
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

function attemptAt(areas, scale, { sky, start, iterations }) {
  const nodes = areas.map((a) => ({ ...targetOf(a, sky), ...bandOf(a, sky), r: bubbleRadius(a.stats.files) * scale }));
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
 * Positions for the Risk sky: each area pulled to its distance in its zone
 * (densityDistance under the areas' own skyScale) at its own angle, pushed off its neighbours, shrunk until nothing overlaps and
 * everything fits the rim. If no scale within MAX_TRIES is clean, the
 * attempt with the least total overlap wins.
 * @param {{name: string, density: number, stats: {files: number}}[]} areas
 * @returns {{x: number, y: number, r: number}[]} same order, sky-radius units
 */
export function layoutSky(areas) {
  return bestLayout(areas, { sky: skyScale(areas), start: null, iterations: ITERATIONS });
}

/**
 * The sky of a run that follows another: every area starts where it was
 * (`previous`, by name; new areas at their target) and settles from there,
 * so bubbles drift instead of jumping.
 * @param {{name: string, density: number, stats: {files: number}}[]} areas as for layoutSky
 * @param {Map<string, {x: number, y: number}>} previous positions to start from, by area name
 * @returns {{x: number, y: number, r: number}[]} same order, sky-radius units
 */
export function layoutSkyFrom(areas, previous) {
  return bestLayout(areas, { sky: skyScale(areas), start: previous, iterations: ANCHORED_ITERATIONS });
}

/**
 * The areas of a set that get a bubble: at least SKY_MIN_FILES files.
 * @param {{areas: {stats: {files: number}}[]}} areaSet decodeAreas or areaSetAt output
 * @returns {object[]} the bubble areas, in the set's order
 */
export function skyAreas(areaSet) {
  return areaSet.areas.filter((a) => a.stats.files >= SKY_MIN_FILES);
}
