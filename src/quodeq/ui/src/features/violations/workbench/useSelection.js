/**
 * The workbench's selected finding. The state names one; while it is visible
 * that is the selection. When it vanishes (a filter hides it, it gets
 * dismissed, the payload refreshes) the selection becomes the finding now at
 * the index it had, clamped to the last row, and stays there until the user
 * picks another.
 */
import { useLayoutEffect, useRef } from 'react';

/**
 * @param {string[]} ids the visible finding ids, in list order.
 * @param {?string} wanted the id the state names.
 * @param {?{ids: string[], wanted: ?string, resolved: ?string}} prev the last render's inputs and answer.
 * @returns {?string} the id to show as selected.
 */
export function resolveSelection(ids, wanted, prev) {
  if (ids.includes(wanted)) return wanted;
  if (prev && prev.wanted === wanted && ids.includes(prev.resolved)) return prev.resolved;
  const at = prev ? prev.ids.indexOf(prev.resolved) : -1;
  if (at < 0) return ids[0] ?? null;
  return ids[Math.min(at, ids.length - 1)] ?? null;
}

export function useSelection(ids, wanted) {
  const prev = useRef(null);
  const resolved = resolveSelection(ids, wanted, prev.current);
  useLayoutEffect(() => { prev.current = { ids, wanted, resolved }; });
  return resolved;
}
