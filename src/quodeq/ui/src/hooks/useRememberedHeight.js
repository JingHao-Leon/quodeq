import { useEffect } from 'react';

/**
 * Report the element's height to `onHeight` while `enabled`, now and on every
 * resize, so the last height it settles at is the one kept (a block's
 * content can grow a frame or two after mount).
 * @param {{current: ?Element}} ref
 * @param {boolean} enabled
 * @param {(height: number) => void} onHeight
 * @param {Array} deps what `onHeight` closes over
 */
export function useRememberedHeight(ref, enabled, onHeight, deps) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return undefined;
    const report = () => onHeight(el.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what onHeight reads
  }, [ref, enabled, ...deps]);
}
