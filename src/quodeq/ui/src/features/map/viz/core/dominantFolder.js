/** Pure helper, no DOM: share of all files above which a top-level folder opens zoomed in. */
export const DOMINANT_SHARE = 0.8;

function countFiles(node) {
  const kids = (Array.isArray(node?.children) ? node.children : []);
  if (!kids.length) return node.isFile ? 1 : 0;
  return kids.reduce((sum, c) => sum + countFiles(c), 0);
}

/** The path of a top-level folder holding more than DOMINANT_SHARE of the files, else null. */
export function dominantFolderPath(tree) {
  const kids = (Array.isArray(tree?.children) ? tree.children : []);
  if (!kids.length) return null;
  const total = countFiles(tree);
  const big = kids.find((c) => !c.isFile && (c.children || []).length && countFiles(c) > total * DOMINANT_SHARE);
  return big ? big.path : null;
}
