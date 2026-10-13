/**
 * What a hit selects: the deepest circle under the pointer, at any depth and
 * whether or not it sits inside the open folder. The open folder itself is
 * never a pick (a click in its empty space does nothing).
 * @param {object|null} circle the deepest circle under the cursor
 * @param {object} focusNode the open folder (the root at the top)
 * @returns {object|null}
 */
export function pickUnderPointer(circle, focusNode) {
  return circle && circle !== focusNode ? circle : null;
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
