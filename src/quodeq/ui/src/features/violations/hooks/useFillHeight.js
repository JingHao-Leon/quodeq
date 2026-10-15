import { useLayoutEffect } from 'react';

/** The CSS variable the split reads its height from (violationsWorkbench.css). */
export const FILL_VAR = '--wb-fill';
/** The overflow values that make an ancestor scroll. */
const SCROLLING = new Set(['auto', 'scroll']);

/** The nearest ancestor that scrolls the page vertically (the dashboard), or null. */
function scrollParent(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (SCROLLING.has(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/** The room from the top of `el` to the bottom of the page's scroller, inside its padding, with the page scrolled to the top. */
export function fillHeightOf(el) {
  const scroller = scrollParent(el);
  if (!scroller) return null;
  const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const padBottom = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
  return Math.round(scroller.clientHeight - padBottom - top);
}

/**
 * Size the element at `ref` down to the bottom of the window, as measured,
 * instead of a guess at what sits above it: again when the window resizes
 * or the content above it (a row of chips, a header line) changes height.
 * @param {{current: ?HTMLElement}} ref
 * @param {boolean} [active] false while the element is not rendered
 */
export function useFillHeight(ref, active = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return undefined;
    const measure = () => {
      const h = fillHeightOf(el);
      if (h != null) el.style.setProperty(FILL_VAR, `${h}px`);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (observer && el.parentElement) observer.observe(el.parentElement);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, active]);
}
