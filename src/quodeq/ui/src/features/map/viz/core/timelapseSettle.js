import { packEnclose } from 'd3-hierarchy';
import { XYR_STRIDE, XYR_Y as Y, XYR_R as R } from './packLayout.js';
import { SIBLING_GAP_SCALE, SIBLING_GAP_MIN, FOLDER_MARGIN_SCALE, FOLDER_MARGIN_MIN } from './proportionalPack.js';
import { forNeighbourPairs } from './circleGrid.js';

/**
 * How a folder's children settle in one time-lapse run (timelapseLayout.js):
 * from their places today they drift toward the folder's centre, big ones
 * harder, push apart until they keep the Map's sibling gap, and the folder
 * wraps them with the Map's own margin.
 */

const GOLDEN_ANGLE = 2.399963;
/** Pull toward the folder centre per step: a base for every child, plus more for big ones. */
const PULL_BASE = 0.03;
const PULL_SIZE = 0.05;
const PULL_EXP = 1.2;
const RELAX_ITERATIONS = 70;
const SETTLE_PASSES = 16;
const RECENTRE_ROUNDS = 2;
const RECENTRE_ITERATIONS = 25;
const ROOM_ATTEMPTS = 4;
const UNTANGLE_PASSES = 80;
const UNTANGLE_PASSES_BIG = 25;
const UNTANGLE_CHECK_EVERY = 4;
/** Groups this big or bigger skip the settle and only untangle. */
const BIG_GROUP = 400;
/** Groups up to this size check every pair; larger ones use the grid. */
const ALL_PAIRS_MAX = 48;
/** Overlap (layout units) a folder tolerates before it takes more room, and the untangle target. */
const OVERLAP_TOLERANCE = 0.6;
const UNTANGLED = 0.18;
/** A folder's starting room: circles pack at about this density. */
const PACK_DENSITY = 0.8;
const PAD_SCALE = 1.8;
const PAD_MIN = 0.9;
const ROOM_GROWTH = 0.5;
const ROOM_STEP = 0.6;
const NUDGE = 1e-3;
const TINY = 1e-6;

/** The Map's gap between two siblings of radius `a` and `b` (proportionalPack's spacing). */
function siblingGap(a, b) {
  return (SIBLING_GAP_SCALE - 1) * (a + b) + 2 * SIBLING_GAP_MIN;
}

/** Push two overlapping slots apart (keeping the sibling gap), the smaller one giving way more. */
function separate(p, q, nudgeSeed) {
  let dx = q.x - p.x;
  let dy = q.y - p.y;
  if (dx === 0 && dy === 0) { dx = Math.cos(nudgeSeed * GOLDEN_ANGLE) * NUDGE; dy = Math.sin(nudgeSeed * GOLDEN_ANGLE) * NUDGE; }
  const d = Math.hypot(dx, dy) || TINY;
  const m = p.r + q.r + siblingGap(p.r, q.r) - d;
  if (m <= 0) return;
  dx /= d; dy /= d;
  const wp = q.r / (p.r + q.r);
  const wq = p.r / (p.r + q.r);
  p.x -= dx * m * wp; p.y -= dy * m * wp;
  q.x += dx * m * wq; q.y += dy * m * wq;
}

function collide(slots, maxR) {
  if (slots.length <= ALL_PAIRS_MAX) {
    for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) separate(slots[a], slots[b], a + b);
    return;
  }
  forNeighbourPairs(slots, siblingGap(maxR, maxR), (a, b) => separate(slots[a], slots[b], a + b));
}

function worstOverlap(slots) {
  let w = 0;
  const visit = (a, b) => { w = Math.max(w, slots[a].r + slots[b].r - Math.hypot(slots[b].x - slots[a].x, slots[b].y - slots[a].y)); };
  if (slots.length > ALL_PAIRS_MAX) forNeighbourPairs(slots, 0, visit);
  else for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) visit(a, b);
  return w;
}

function pullIn(slots, maxR) {
  for (const s of slots) {
    const pull = PULL_SIZE * (s.r / maxR) ** PULL_EXP + PULL_BASE;
    s.x -= s.x * pull; s.y -= s.y * pull;
  }
}

/** Centre the group on its enclosing circle (with the sibling gap around each); returns that circle. */
function recentre(slots) {
  const e = packEnclose(slots.map((s) => ({ x: s.x, y: s.y, r: s.r * SIBLING_GAP_SCALE + SIBLING_GAP_MIN })));
  for (const s of slots) { s.x -= e.x; s.y -= e.y; }
  return e;
}

function contain(slots, room, pad) {
  for (const s of slots) {
    const lim = Math.max(0, room - pad - s.r);
    const d = Math.hypot(s.x, s.y);
    if (d > lim) { s.x *= lim / d; s.y *= lim / d; }
  }
}

/** Drift toward the centre inside `room`, giving the folder more room (up to its size today) while children still overlap. */
function relaxInRoom(slots, { room, pad, todayR, maxR }) {
  const start = slots.map((s) => [s.x, s.y]);
  let r = room;
  for (let attempt = 0; attempt < ROOM_ATTEMPTS; attempt++) {
    slots.forEach((s, j) => { s.x = start[j][0]; s.y = start[j][1]; });
    for (let it = 0; it < RELAX_ITERATIONS; it++) { pullIn(slots, maxR); collide(slots, maxR); collide(slots, maxR); contain(slots, r, pad); }
    for (let it = 0; it < SETTLE_PASSES; it++) { collide(slots, maxR); contain(slots, r, pad); }
    if (worstOverlap(slots) <= OVERLAP_TOLERANCE || r >= todayR) return;
    r = Math.min(todayR, r + (todayR - r) * ROOM_GROWTH + ROOM_STEP);
  }
}

/** Re-centre and settle again, then untangle until nothing overlaps (with a safety limit). */
function tighten(slots, maxR) {
  const small = slots.length < BIG_GROUP;
  for (let round = 0; round < RECENTRE_ROUNDS; round++) {
    recentre(slots);
    if (small) for (let it = 0; it < RECENTRE_ITERATIONS; it++) { pullIn(slots, maxR); collide(slots, maxR); collide(slots, maxR); }
  }
  const passes = small ? UNTANGLE_PASSES : UNTANGLE_PASSES_BIG;
  for (let it = 0; it < passes; it++) {
    collide(slots, maxR);
    if (it % UNTANGLE_CHECK_EVERY === UNTANGLE_CHECK_EVERY - 1 && worstOverlap(slots) <= UNTANGLED) return;
  }
}

/** A folder's padding and starting room: what its children need at pack density, never more than its size today. */
function roomFor(i, slots, base, maxR) {
  const pad = i === 0 ? base.pad[i] : base.pad[i] * PAD_SCALE + PAD_MIN;
  const need = Math.sqrt(slots.reduce((t, s) => t + (s.r + base.gap[i] / 2) ** 2, 0) / PACK_DENSITY) + pad;
  return { pad, room: Math.min(base.xyr[i * XYR_STRIDE + R], Math.max(maxR + pad, need)) };
}

/**
 * Settle folder `i`'s present children (their offsets into ox/oy) and return
 * its radius in the run; `base` is the layout's base (kids, xyr, pad, gap).
 */
export function settleFolder(i, { base, rad, ox, oy }) {
  const { kids, xyr } = base;
  const o = i * XYR_STRIDE;
  const slots = kids[i].filter((c) => rad[c] > 0).map((c) => ({
    c, x: xyr[c * XYR_STRIDE] - xyr[o], y: xyr[c * XYR_STRIDE + Y] - xyr[o + Y], r: rad[c],
  }));
  if (!slots.length) return 0;
  // A folder holding only one folder is drawn as that folder (a collapsed chain).
  if (i > 0 && slots.length === 1 && kids[slots[0].c].length) { ox[slots[0].c] = 0; oy[slots[0].c] = 0; return slots[0].r; }
  const maxR = Math.max(...slots.map((s) => s.r), TINY);
  const { pad, room } = roomFor(i, slots, base, maxR);
  if (slots.length > 1 && slots.length < BIG_GROUP) relaxInRoom(slots, { room, pad, todayR: xyr[o + R], maxR });
  else contain(slots, room, pad);
  if (slots.length > 1) tighten(slots, maxR);
  const e = recentre(slots);
  for (const s of slots) { ox[s.c] = s.x; oy[s.c] = s.y; }
  return e.r * FOLDER_MARGIN_SCALE + FOLDER_MARGIN_MIN;
}
