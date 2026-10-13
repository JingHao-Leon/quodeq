const SEP = '/';

function containsPath(node, path) {
  return node.path === path || path.startsWith(node.path + SEP);
}

/**
 * The deepest folder node of the Map's tree that is `path` or contains it.
 * Collapsed folder chains have one node (the deepest folder's path), so a
 * folder inside a chain snaps to the node that holds it.
 * @returns {string} that node's path, '' for the root
 */
export function nearestTreePath(tree, path) {
  let node = tree;
  let found = '';
  while (node) {
    const next = (node.children || []).find((c) => !c.isFile && containsPath(c, path));
    if (next) found = next.path;
    node = next;
  }
  return found;
}
