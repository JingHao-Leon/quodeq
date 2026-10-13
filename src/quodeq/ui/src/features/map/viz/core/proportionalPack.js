import { packSiblings, packEnclose } from 'd3-hierarchy';
import { isPackFolder } from './packNode.js';

// Each sibling is packed as if 3 % larger plus a hair, so neighbours keep a
// gap of about 1.5 % of their radius on each side, at every depth.
export const SIBLING_GAP_SCALE = 1.03;
export const SIBLING_GAP_MIN = 0.08;
// A folder wraps its packed children with a margin about the size of the
// sibling gap, so the spacing inside and outside a folder looks the same.
export const FOLDER_MARGIN_SCALE = 1.035;
export const FOLDER_MARGIN_MIN = 0.1;

function leafRadius(node) {
  return Math.sqrt(Math.max(1, node.value || 0));
}

function packFolder(node) {
  const slots = node.children.map((child) => ({ child, r: child.r * SIBLING_GAP_SCALE + SIBLING_GAP_MIN }));
  packSiblings(slots);
  const hull = packEnclose(slots);
  for (const slot of slots) {
    slot.child.dx = slot.x - hull.x;
    slot.child.dy = slot.y - hull.y;
  }
  node.r = hull.r * FOLDER_MARGIN_SCALE + FOLDER_MARGIN_MIN;
}

function placeFromOffsets(root) {
  root.x = 0;
  root.y = 0;
  root.eachBefore((node) => {
    if (!node.parent) return;
    node.x = node.parent.x + node.dx;
    node.y = node.parent.y + node.dy;
  });
}

/**
 * Lay out a summed d3 hierarchy bottom-up: a leaf's area is proportional to
 * its value, every gap and margin is a proportion of the circles involved,
 * and the whole map is scaled to a centred circle of diameter `size`.
 * @param {import('d3-hierarchy').HierarchyNode} root
 * @param {number} size
 * @returns {import('d3-hierarchy').HierarchyNode} the same root, positioned
 */
export function packProportional(root, size) {
  root.eachAfter((node) => {
    if (isPackFolder(node)) packFolder(node);
    else node.r = leafRadius(node);
  });
  placeFromOffsets(root);
  const half = size / 2;
  const scale = half / root.r;
  root.each((node) => {
    node.x = half + node.x * scale;
    node.y = half + node.y * scale;
    node.r *= scale;
    delete node.dx;
    delete node.dy;
  });
  return root;
}
