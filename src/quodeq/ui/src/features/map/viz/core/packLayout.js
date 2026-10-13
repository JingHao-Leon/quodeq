import { hierarchy } from 'd3-hierarchy';
import { packProportional } from './proportionalPack.js';
import { isPackFolder } from './packNode.js';

// Layout units for the circle pack; the canvas viewport (packViewport) scales
// them to the screen.
export const PACK_BASE_SIZE = 600;
// Trees at or above this many nodes lay out in the worker instead of the
// render thread.
export const PACK_WORKER_NODE_THRESHOLD = 2000;
/** Numbers per node in a layout array: x, y, r. */
export const XYR_STRIDE = 3;
/** Offset of a node's y within its stride of a layout array. */
export const XYR_Y = 1;
/** Offset of a node's radius within its stride of a layout array. */
export const XYR_R = 2;

/** Circle `i` of a layout array (x, y, r per node) as `{x, y, r}`. */
export function circleAt(xyr, i) {
  const o = i * XYR_STRIDE;
  return { x: xyr[o], y: xyr[o + 1], r: xyr[o + 2] };
}

/** Checks run on a file: its violations plus its passing checks, at least 1. */
export function checksRun(node) {
  return Math.max(1, (node.violations || 0) + (node.compliance || 0));
}

/** The d3 hierarchy for a file-tree node: leaf value = checks run (spec 2.3,
 * "size = checks run"), children sorted largest first. */
export function buildPackRoot(node) {
  return hierarchy(node, (d) => d.children || [])
    .sum((d) => (isPackFolder(d) ? 0 : checksRun(d)))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
}

/** Run the proportional pack on a hierarchy in place. */
export function packInPlace(root) {
  return packProportional(root, PACK_BASE_SIZE);
}

export function layoutCircles(root) {
  return root.descendants().filter((c) => c.r > 0);
}

/** A structured-clone friendly copy of a hierarchy: values and child order
 * only, no file data. Children keep the sorted order so preorder indices
 * line up with `root.descendants()` on the other side. */
export function slimTree(root) {
  const slim = { v: root.value };
  if (root.children) slim.c = root.children.map(slimTree);
  return slim;
}

/** Pack a slim tree and return `[x, y, r]` per node in preorder. */
export function packSlim(slim) {
  const root = hierarchy(slim, (d) => d.c).each((n) => { n.value = n.data.v; });
  packInPlace(root);
  const nodes = root.descendants();
  const xyr = new Float64Array(nodes.length * XYR_STRIDE);
  nodes.forEach((n, i) => {
    xyr[i * XYR_STRIDE] = n.x;
    xyr[i * XYR_STRIDE + 1] = n.y;
    xyr[i * XYR_STRIDE + 2] = n.r;
  });
  return xyr;
}

/** Write worker positions back onto the hierarchy the slim tree came from. */
export function applyPositions(root, xyr) {
  root.descendants().forEach((n, i) => {
    n.x = xyr[i * XYR_STRIDE];
    n.y = xyr[i * XYR_STRIDE + 1];
    n.r = xyr[i * XYR_STRIDE + 2];
  });
  return root;
}

/** The worker's whole job, kept pure so tests run it without a Worker. */
export function handlePackMessage({ id, slim }) {
  return { id, xyr: packSlim(slim) };
}
