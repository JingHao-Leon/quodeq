import { forNeighbourPairs } from './circleGrid.js';
import { PACK_BASE_SIZE, XYR_STRIDE } from './packLayout.js';

// Invariant checks and statistics over layout arrays (x, y, r per node), for
// the time-lapse tests, the performance budget and the real-data measurement.

/** Sibling overlap the spec tolerates, in layout units (the map is PACK_BASE_SIZE across). */
export const OVERLAP_TOLERANCE = 1;
const EPS = 1e-3;
const Y = 1;
const R = 2;

const circleAt = (xyr, i) => ({ x: xyr[i * XYR_STRIDE], y: xyr[i * XYR_STRIDE + Y], r: xyr[i * XYR_STRIDE + R] });

/** How many drawn circles reach outside their parent. */
export function childrenOutside(parent, xyr) {
  let count = 0;
  for (let i = 1; i < parent.length; i++) {
    const c = circleAt(xyr, i);
    if (c.r <= 0) continue;
    const p = circleAt(xyr, parent[i]);
    if (Math.hypot(c.x - p.x, c.y - p.y) + c.r > p.r + EPS) count++;
  }
  return count;
}

function siblingGroups(parent, xyr) {
  const groups = new Map();
  for (let i = 1; i < parent.length; i++) {
    if (xyr[i * XYR_STRIDE + R] <= 0) continue;
    const list = groups.get(parent[i]);
    if (list) list.push(i); else groups.set(parent[i], [i]);
  }
  return [...groups.values()];
}

/** The deepest overlap between two drawn siblings, in layout units (0 when none touch). */
export function maxSiblingOverlap(parent, xyr) {
  let worst = 0;
  for (const ids of siblingGroups(parent, xyr)) {
    const circles = ids.map((i) => circleAt(xyr, i));
    forNeighbourPairs(circles, 0, (p, q) => {
      const a = circles[p];
      const b = circles[q];
      worst = Math.max(worst, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
    });
  }
  return worst;
}

/** How far each folder drawn in both layouts moved, as a share of the map width. */
export function folderMovements(parent, a, b) {
  const folders = new Set(parent.filter((p) => p >= 0));
  const out = [];
  for (const i of folders) {
    const p = circleAt(a, i);
    const q = circleAt(b, i);
    if (p.r > 0 && q.r > 0) out.push(Math.hypot(p.x - q.x, p.y - q.y) / PACK_BASE_SIZE);
  }
  return out;
}

/** The value at `share` (0..1) of the sorted values; 0 for none. */
export function percentile(values, share) {
  if (!values.length) return 0;
  const sorted = [...values].sort((p, q) => p - q);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}
