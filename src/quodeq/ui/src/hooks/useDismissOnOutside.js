import { useEffect } from 'react';
import { KEY } from '../vocab/keyboard.js';

/**
 * Closes an open popover on a press outside `rootRef` or on Escape. The
 * listeners exist only while `open` is true.
 * @param {boolean} open
 * @param {{current: Element|null}} rootRef - the popover's trigger and menu wrapper
 * @param {() => void} close
 * @param {{current: Element|null}} [triggerRef] - a trigger outside `rootRef`;
 *   a press on it is left to its own click handler (which toggles)
 */
export function useDismissOnOutside(open, rootRef, close, triggerRef) {
  useEffect(() => {
    if (!open) return undefined;
    const inside = (ref, target) => Boolean(ref?.current?.contains(target));
    const onDown = (e) => { if (!inside(rootRef, e.target) && !inside(triggerRef, e.target)) close(); };
    const onKey = (e) => { if (e.key === KEY.ESCAPE) close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, rootRef, close, triggerRef]);
}
