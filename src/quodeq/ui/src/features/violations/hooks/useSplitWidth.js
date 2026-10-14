import { useCallback, useRef, useState } from 'react';
import { readString, writeString } from '../../../adapters/storage.js';

const SPLIT_KEY = 'quodeq-findings-split';
/** The list's share of the row, as a percentage: its default, and how far the divider may go. */
const DEFAULT_PCT = 46;
const MIN_PCT = 22;
const MAX_PCT = 78;
const PERCENT = 100;

const clampPct = (p) => Math.min(MAX_PCT, Math.max(MIN_PCT, p));

function storedPct() {
  const n = Number(readString(SPLIT_KEY));
  return Number.isFinite(n) && n > 0 ? clampPct(n) : DEFAULT_PCT;
}

/**
 * The list's width beside the detail, dragged with the divider between them
 * and remembered: `rootRef` on the split, `onPointerDown` on the divider.
 */
export function useSplitWidth() {
  const [pct, setPct] = useState(storedPct);
  const rootRef = useRef(null);
  const onPointerDown = useCallback((e) => {
    const root = rootRef.current;
    if (!root) return;
    e.preventDefault();
    const box = root.getBoundingClientRect();
    let last = pct;
    const move = (ev) => { last = clampPct(((ev.clientX - box.left) / box.width) * PERCENT); setPct(last); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      writeString(SPLIT_KEY, String(Math.round(last)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [pct]);
  return { pct, rootRef, onPointerDown };
}
