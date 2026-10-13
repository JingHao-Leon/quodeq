// src/quodeq/ui/src/features/map/viz/core/skyLabels.js
import { RING_KINDS } from '../../mapVocab.js';

/** Height of one label line, and of the two-line block (name, issue count). */
export const LABEL_LINE_PX = 12;
export const LABEL_BLOCK_PX = 26;
const TOP_BY_WEIGHT = 10;
const BELOW_GAP = 13;
const ABOVE_GAP = 18;
const SIDE_GAP = 6;
const PAD = 4;
const BUBBLE_GRACE = 2;   // a label may graze a bubble's edge by this much
const FAR_STEPS = 2;      // how many label steps further out a must label may move

const isIndex = (i) => i !== null && i !== undefined;

/** Indices of the ten heaviest areas by weight. */
function heaviest(areas) {
  return areas.map((a, i) => [a.stats.weight, i]).sort((p, q) => q[0] - p[0]).slice(0, TOP_BY_WEIGHT).map(([, i]) => i);
}

/** Action kinds, plus the hovered and selected areas. */
function alwaysLabelled({ areas, hovered, selected }) {
  const chosen = new Set();
  areas.forEach((a, i) => { if (RING_KINDS.includes(a.kind)) chosen.add(i); });
  if (isIndex(hovered)) chosen.add(hovered);
  if (isIndex(selected)) chosen.add(selected);
  return chosen;
}

/** Which areas show a label: action kinds always, the ten heaviest, hovered and selected. */
export function chooseLabelled({ areas, hovered, selected }) {
  const chosen = alwaysLabelled({ areas, hovered, selected });
  heaviest(areas).forEach((i) => chosen.add(i));
  return chosen;
}

/**
 * Labels that are kept even without a clear spot (they avoid other labels and
 * may graze bubbles): action kinds, hover and selection, and with labels on,
 * the ten heaviest areas, so a dense sky still names its biggest areas.
 * @returns {Set<number>}
 */
export function mustLabelled({ areas, hovered, selected, showLabels }) {
  const must = alwaysLabelled({ areas, hovered, selected });
  if (showLabels) heaviest(areas).forEach((i) => must.add(i));
  return must;
}

function candidates(b, w) {
  return [
    [b.px, b.py + b.R + BELOW_GAP],
    [b.px, b.py - b.R - ABOVE_GAP],
    [b.px + b.R + SIDE_GAP + w / 2, b.py],
    [b.px - b.R - SIDE_GAP - w / 2, b.py],
  ];
}

function boxAt(x, y, w) {
  return { x0: x - w / 2, x1: x + w / 2, y0: y - LABEL_LINE_PX, y1: y + LABEL_BLOCK_PX - LABEL_LINE_PX };
}

function boxesOverlap(a, b) {
  return a.x0 < b.x1 + PAD && b.x0 < a.x1 + PAD && a.y0 < b.y1 + PAD && b.y0 < a.y1 + PAD;
}

function hitsBubble(box, bubbles, own) {
  return bubbles.some((b, i) => {
    if (i === own) return false;
    const nx = Math.min(Math.max(b.px, box.x0), box.x1);
    const ny = Math.min(Math.max(b.py, box.y0), box.y1);
    return Math.hypot(b.px - nx, b.py - ny) < b.R - BUBBLE_GRACE;
  });
}

/**
 * Further spots for a must label: the four sides pushed out by one and two
 * label steps, then the diagonals beside the below and above spots.
 */
function fartherCandidates(b, w) {
  const [below, above, right, left] = candidates(b, w);
  const dy = LABEL_BLOCK_PX + PAD;
  const dx = w + PAD;
  const out = [];
  for (let k = 1; k <= FAR_STEPS; k++) {
    out.push([below[0], below[1] + k * dy], [above[0], above[1] - k * dy], [right[0] + k * dx, right[1]], [left[0] - k * dx, left[1]]);
  }
  out.push([b.px + dx, below[1]], [b.px - dx, below[1]], [b.px + dx, above[1]], [b.px - dx, above[1]]);
  return out;
}

/**
 * A spot clear of every placed label. A wanted label also needs to keep off
 * other bubbles and tries the four near spots only; a must label prefers a
 * bubble-free spot, may graze bubbles, and tries farther spots too. Null when
 * nothing is free: labels never overlap each other.
 */
function spotFor(index, { bubbles, placed, w, must }) {
  const free = (box) => !placed.some((p) => boxesOverlap(p.box, box));
  const b = bubbles[index];
  const spots = must ? [...candidates(b, w), ...fartherCandidates(b, w)] : candidates(b, w);
  const boxes = spots.map(([x, y]) => ({ x, y, box: boxAt(x, y, w) })).filter((c) => free(c.box));
  const clear = boxes.find((c) => !hitsBubble(c.box, bubbles, index));
  if (clear || !must) return clear || null;
  return boxes[0] || null;
}

/**
 * Greedy label placement: must-show labels first, then the rest, larger
 * bubbles first; each takes the first spot (below, above, right, left) clear
 * of other bubbles and labels. Must labels may move further out and graze
 * bubbles. No two labels ever overlap: a label without a free spot is
 * dropped (the area keeps its tooltip, keyboard button and panel).
 * @returns {{index: number, x: number, y: number}[]}
 */
export function placeSkyLabels({ bubbles, wanted, must, measure }) {
  const order = [...new Set([...must, ...wanted])]
    .sort((a, b) => Number(must.has(b)) - Number(must.has(a)) || bubbles[b].R - bubbles[a].R);
  const placed = [];
  for (const index of order) {
    const spot = spotFor(index, { bubbles, placed, w: measure(index), must: must.has(index) });
    if (spot) placed.push({ index, x: spot.x, y: spot.y, box: spot.box });
  }
  return placed.map(({ index, x, y }) => ({ index, x, y }));
}
