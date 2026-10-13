// Neighbour pairs of circles through a uniform grid, shared by the Risk sky
// and the time-lapse layout so neither has to check every pair.

const GRID_STRIDE = 65536;   // packs a cell's column and row into one Map key
const HALF = 0.5;
// A circle never spans more than this many cells per side, so one giant among
// many tiny circles does not fill thousands of cells.
const MAX_SPAN_CELLS = 16;
const MIN_CELL = 1e-6;

/** Cell size: twice the median radius plus the pad, never so small that the widest circle spans too many cells. */
function cellSize(circles, pad) {
  const radii = circles.map((c) => c.r).sort((p, q) => p - q);
  const median = radii[Math.floor(radii.length * HALF)] || 0;
  const widest = radii[radii.length - 1] || 0;
  return Math.max(2 * median + pad, (2 * (widest + pad)) / MAX_SPAN_CELLS, MIN_CELL);
}

function spanOf(c, pad, cell) {
  const reach = c.r + pad;
  return {
    x0: Math.floor((c.x - reach) / cell), x1: Math.floor((c.x + reach) / cell),
    y0: Math.floor((c.y - reach) / cell), y1: Math.floor((c.y + reach) / cell),
  };
}

/** Uniform grid over the circles' pad-grown boxes; a big circle sits in every cell its box covers. */
function buildGrid(circles, pad, cell) {
  const cells = new Map();
  const spans = circles.map((c) => spanOf(c, pad, cell));
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

/**
 * Calls visit(i, j) once for every pair of circles whose boxes, grown by
 * `pad`, share a grid cell: every pair closer than their radii plus twice
 * the pad is among them.
 * @param {{x: number, y: number, r: number}[]} circles
 * @param {number} pad extra reach around each circle
 * @param {function(number, number): void} visit
 */
export function forNeighbourPairs(circles, pad, visit) {
  if (circles.length < 2) return;
  const { cells, spans } = buildGrid(circles, pad, cellSize(circles, pad));
  for (const [key, list] of cells) {
    for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      if (ownsPair(key, spans[list[p]], spans[list[q]])) visit(list[p], list[q]);
    }
  }
}
