/**
 * Pure tree navigation for the map page: no DOM, no fetch, no storage.
 * Extracted from useMapPageState so the filtering/breadcrumb logic is
 * unit-testable without mounting the hook.
 */
const MAX_TREE_DEPTH = 64;

// Whether `child` is `path` itself or an ancestor of it. The '/' is what
// keeps 'src/app' from matching a sibling called 'src/apps'.
function isOnPathTo(child, path) {
  return path === child.path || path.startsWith(child.path + '/');
}

// A node's children, tolerating a leaf (no children key) and a null node.
function childrenOf(node) {
  return Array.isArray(node?.children) ? node.children : [];
}

/** Locate the subtree whose node.path equals `path`; falls back to root. */
export function findSubtree(root, path) {
  if (!path) return root;
  function walk(node, depth = 0) {
    if (depth > MAX_TREE_DEPTH) return null;
    if (node.path === path) return node;
    for (const child of childrenOf(node)) {
      if (isOnPathTo(child, path)) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(root) || root;
}

/** Ancestor chain (name/path pairs) from root down to `path`, excluding root. */
export function buildBreadcrumbPath(root, path) {
  if (!path) return [];
  const crumbs = [];
  let node = root;
  while (node && node.path !== path) {
    const child = childrenOf(node).find((c) => isOnPathTo(c, path));
    if (!child) break;
    crumbs.push({ name: child.name, path: child.path });
    node = child;
  }
  return crumbs;
}

/** Share of all files above which a top-level folder opens zoomed in. */
export const DOMINANT_SHARE = 0.8;

function countFiles(node) {
  const kids = childrenOf(node);
  if (!kids.length) return node.isFile ? 1 : 0;
  return kids.reduce((sum, c) => sum + countFiles(c), 0);
}

/** The path of a top-level folder holding more than DOMINANT_SHARE of the files, else null. */
export function dominantFolderPath(tree) {
  const kids = childrenOf(tree);
  if (!kids.length) return null;
  const total = countFiles(tree);
  const big = kids.find((c) => !c.isFile && childrenOf(c).length && countFiles(c) > total * DOMINANT_SHARE);
  return big ? big.path : null;
}
