/**
 * Whether a pack node is drawn as a folder: it has at least one child. Works on
 * d3 hierarchy nodes and on raw tree data alike; an empty folder reads as a file.
 * @param {{children?: object[]}} node
 * @returns {boolean}
 */
export function isPackFolder(node) {
  return Boolean(node.children?.length);
}
