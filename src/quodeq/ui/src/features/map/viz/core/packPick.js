/**
 * What a hit at `circle` selects while `focusNode` is open: the child of the
 * focus that contains it (a file is selectable only inside its own folder),
 * or null when the hit is outside the focused folder.
 * @param {object|null} circle the deepest circle under the cursor
 * @param {object} focusNode the open folder (the root at the top)
 * @returns {object|null}
 */
export function pickAtFocusLevel(circle, focusNode) {
  let n = circle;
  while (n && n.parent !== focusNode) n = n.parent;
  return n || null;
}

/**
 * The circle the dimming veil leaves bright: the hovered pick, else the open
 * folder (none at the root).
 * @param {object|null} picked
 * @param {object|null} focusNode
 * @returns {object|null}
 */
export function keepCircle(picked, focusNode) {
  if (picked) return picked;
  return focusNode && focusNode.depth > 0 ? focusNode : null;
}
