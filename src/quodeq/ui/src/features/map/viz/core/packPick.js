/**
 * What a hit selects: the deepest circle under the pointer, at any depth and
 * whether or not it sits inside the open folder, except that a file is
 * reachable only from inside its own folder (elsewhere its folder is picked).
 * The open folder itself is never a pick (a click in its empty space does nothing).
 * @param {object|null} circle the deepest circle under the cursor
 * @param {object} focusNode the open folder (the root at the top)
 * @returns {object|null}
 */
export function pickUnderPointer(circle, focusNode) {
  const picked = circle && circle.data?.isFile && circle.parent !== focusNode ? circle.parent : circle;
  return picked && picked !== focusNode ? picked : null;
}
