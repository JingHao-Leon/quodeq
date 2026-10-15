import { useLayoutEffect } from 'react';

/** The attribute a wrapped item carries when it starts a row. */
export const ROW_START_ATTR = 'data-row-start';

/**
 * Marks each child of `container` that starts a row of its wrapping flex layout: the first child, and any
 * child that sits back left of the one before it. Read by position, not by top, since items on one row may
 * be centred at different heights.
 * @param {{children: ArrayLike<{offsetLeft: number, toggleAttribute: (name: string, force: boolean) => void}>}} container
 */
export function markRowStarts(container) {
  let previousLeft = null;
  for (const child of Array.from(container.children)) {
    child.toggleAttribute(ROW_START_ATTR, previousLeft === null || child.offsetLeft <= previousLeft);
    previousLeft = child.offsetLeft;
  }
}

/**
 * Keeps the row starts marked in `ref`'s element and in its descendants matching `selector`, as they wrap
 * and unwrap on resize, so a divider on an item's left edge shows only between two items on one row.
 * Does nothing where ResizeObserver is missing.
 * @param {{current: ?Element}} ref
 * @param {?string} [selector] nested wrapping containers to mark as well
 */
export function useRowStarts(ref, selector = null) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const containers = [root, ...(selector ? root.querySelectorAll(selector) : [])];
    const markAll = () => containers.forEach(markRowStarts);
    const observer = new ResizeObserver(markAll);
    containers.forEach((el) => observer.observe(el));
    markAll();
    return () => observer.disconnect();
  }, [ref, selector]);
}
