import { useCallback, useRef, useState } from 'react';
import { readString, writeString } from '../../../adapters/storage.js';

/** Where the list's share is remembered (shared by the workbench and the scoped list). */
export const SPLIT_KEY = 'quodeq-findings-split';
/** The list's share of the row, as a percentage: its default, and how far the divider may go. */
export const DEFAULT_PCT = 46;
export const MIN_PCT = 22;
export const MAX_PCT = 78;
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
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    remember(last);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/**
 * The list's width beside the detail, dragged with the divider between them
 * and remembered: `rootRef` on the split, `onPointerDown` on the divider.
 * @returns {{pct: number, rootRef: object, onPointerDown: Function}}
 */
export function useSplitWidth() {
  const [pct, setPct] = useState(storedPct);
  const rootRef = useRef(null);
  const onPointerDown = useCallback((e) => {
    if (!rootRef.current) return;
    e.preventDefault();
    dragAcross(rootRef.current, pct, setPct);
  }, [pct]);
  return { pct, rootRef, onPointerDown };
}
