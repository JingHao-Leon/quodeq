import { useLayoutEffect, useRef, useState } from 'react';

// A row of fewer cards still splits into this many columns, so one or two
// cards are as wide as they are in a full row of three.
const MIN_COLUMNS = 3;

/**
 * Columns that spread `count` cards evenly over the rows they need: 9 cards
 * that fit 8 across become 5 + 4, never 8 + 1. Fewer cards than fit in one
 * row take at least MIN_COLUMNS columns rather than stretch over the row.
 * Pure, for the hook below.
 */
export function balancedColumns(count, width, minCard, gap) {
  if (count <= 0 || width <= 0) return null;
  const fit = Math.max(1, Math.floor((width + gap) / (minCard + gap)));
  if (count < fit) return Math.min(fit, Math.max(count, MIN_COLUMNS));
  const rows = Math.ceil(count / fit);
  return Math.ceil(count / rows);
}

/**
 * A ref for the grid and the inline style that sets its balanced column
 * count, kept current as the grid resizes. Measured in a layout effect, before
 * the first paint, so the cards never show the stylesheet's auto-fit layout
 * for a frame and then re-flow into the balanced one (the jump on a project switch).
 */
export function useBalancedColumns(count, minCard, gap) {
  const ref = useRef(null);
  const [cols, setCols] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setCols(balancedColumns(count, el.clientWidth, minCard, gap));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count, minCard, gap]);
  return [ref, cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined];
}
