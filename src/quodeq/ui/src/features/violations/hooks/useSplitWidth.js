import { useCallback, useRef, useState } from 'react';
import { readString, writeString } from '../../../adapters/storage.js';
import { KEY } from '../../../vocab/keyboard.js';
import { POINTER_EVENT } from '../../../vocab/pointerEvent.js';

/** Where the list's share is remembered (shared by the workbench and the scoped list). */
export const SPLIT_KEY = 'quodeq-findings-split';
/** The list's share of the row, as a percentage: its default, how far the divider may go, and one arrow key's step. */
export const DEFAULT_PCT = 46;
export const MIN_PCT = 22;
export const MAX_PCT = 78;
export const KEY_STEP_PCT = 2;
const STEP_OF_KEY = { [KEY.ARROW_LEFT]: -KEY_STEP_PCT, [KEY.ARROW_RIGHT]: KEY_STEP_PCT };
const PERCENT = 100;

const clampPct = (p) => Math.min(MAX_PCT, Math.max(MIN_PCT, p));
const remember = (pct) => writeString(SPLIT_KEY, String(Math.round(pct)));

/** The remembered share, clamped; the default when there is none (or storage is blocked: readString never throws). */
function storedPct() {
  const n = Number(readString(SPLIT_KEY));
  return Number.isFinite(n) && n > 0 ? clampPct(n) : DEFAULT_PCT;
}

/** Follow the pointer across `root` until it is released, then remember where the divider landed. */
function dragAcross(root, start, setPct) {
  const box = root.getBoundingClientRect();
  let last = start;
  const move = (ev) => { last = clampPct(((ev.clientX - box.left) / box.width) * PERCENT); setPct(last); };
  // A cancelled pointer (a touch gesture the browser takes over) ends the drag as a release does.
  const up = () => {
    window.removeEventListener(POINTER_EVENT.MOVE, move);
    window.removeEventListener(POINTER_EVENT.UP, up);
    window.removeEventListener(POINTER_EVENT.CANCEL, up);
    remember(last);
  };
  window.addEventListener(POINTER_EVENT.MOVE, move);
  window.addEventListener(POINTER_EVENT.UP, up);
  window.addEventListener(POINTER_EVENT.CANCEL, up);
}

/**
 * The list's width beside the detail, dragged with the divider between them
 * (or moved with the arrow keys while it has focus) and remembered:
 * `rootRef` on the split, `onPointerDown` and `onKeyDown` on the divider.
 * @returns {{pct: number, rootRef: object, onPointerDown: Function, onKeyDown: Function}}
 */
export function useSplitWidth() {
  const [pct, setPct] = useState(storedPct);
  const rootRef = useRef(null);
  const onPointerDown = useCallback((e) => {
    if (!rootRef.current) return;
    e.preventDefault();
    dragAcross(rootRef.current, pct, setPct);
  }, [pct]);
  const onKeyDown = useCallback((e) => {
    const step = STEP_OF_KEY[e.key];
    if (!step) return;
    e.preventDefault();
    const next = clampPct(pct + step);
    setPct(next);
    remember(next);
  }, [pct]);
  return { pct, rootRef, onPointerDown, onKeyDown };
}
