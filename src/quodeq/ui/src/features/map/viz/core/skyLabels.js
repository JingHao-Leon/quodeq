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

/** Which areas show a label: action kinds always, the ten heaviest, hovered and selected. */
export function chooseLabelled({ areas, hovered, selected }) {
  const chosen = new Set();
  areas.forEach((a, i) => { if (RING_KINDS.includes(a.kind)) chosen.add(i); });
  areas.map((a, i) => [a.stats.weight, i]).sort((p, q) => q[0] - p[0]).slice(0, TOP_BY_WEIGHT).forEach(([, i]) => chosen.add(i));
  if (hovered !== null && hovered !== undefined) chosen.add(hovered);
  if (selected !== null && selected !== undefined) chosen.add(selected);
  return chosen;
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

function spotFor(index, { bubbles, placed, w, must }) {
  const free = (box) => !placed.some((p) => boxesOverlap(p.box, box));
  const boxes = candidates(bubbles[index], w).map(([x, y]) => ({ x, y, box: boxAt(x, y, w) }));
  const clear = boxes.find((c) => free(c.box) && !hitsBubble(c.box, bubbles, index));
  if (clear || !must) return clear || null;
  return boxes.find((c) => free(c.box)) || boxes[0];
}

/**
 * Greedy label placement: must-show labels first, then the rest, larger
 * bubbles first; each takes the first spot (below, above, right, left) clear
 * of other bubbles and labels. Wanted labels without a spot are dropped.
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
