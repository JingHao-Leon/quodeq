import { useEffect, useRef, useState } from 'react';
import { easeInOut } from '../core/packTween.js';
import { TRANSITION } from '../core/timelapseScene.js';

const HALF = 0.5;

/**
 * Animates from the run on screen to `target`. `load(k)` gives a run's state
 * (a value or a promise), `kindOf(from, to)` a TRANSITION, `durationMs` the
 * move (0 = step at once), and `onSettled(k)` hears when `target` is fully on
 * screen. A new target mid-move starts from the nearer end of the move it
 * interrupts. `load`, `kindOf` and `onSettled` must be stable; a new `load`
 * (another history) shows nothing until its first run is in, then that run
 * settled, never a move from the old one.
 * @returns {{from: ({k: number, state: *}|null), to: {k: number, state: *}, kind: string, t: number}|null}
 */
export function useRunTransition({ target, load, kindOf, durationMs, onSettled }) {
  const [shownView, setShownView] = useState({ load, view: null });
  const shown = useRef(null);
  const shownLoad = useRef(load);
  useEffect(() => {
    if (shownLoad.current !== load) shown.current = null;
    shownLoad.current = load;
    let live = true;
    let raf = 0;
    let moving = null;
    const setView = (view) => setShownView({ load, view });
    // The executor runs now, so load starts at once and a throw from it rejects like a failed load.
    new Promise((resolve) => { resolve(load(target)); }).then((state) => {
      if (!live) return;
      const to = { k: target, state };
      const from = shown.current;
      const kind = from && from.k !== target ? kindOf(from.k, target) : TRANSITION.NONE;
      const settle = () => {
        shown.current = to;
        moving = null;
        setView({ from: null, to, kind: TRANSITION.NONE, t: 1 });
        onSettled(target);
      };
      if (kind === TRANSITION.NONE || durationMs <= 0) { settle(); return; }
      const start = performance.now();
      const step = (now) => {
        const t = easeInOut((now - start) / durationMs);
        if (t >= 1) { settle(); return; }
        moving = { from, to, t };
        setView({ from, to, kind, t });
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }).catch((err) => {
      // The run on screen stays; playback waits on a settle that cannot come, so say why.
      if (live) console.warn('[useRunTransition] run could not be loaded', target, err);
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      if (moving) shown.current = moving.t >= HALF ? moving.to : moving.from;
    };
  }, [target, load, kindOf, durationMs, onSettled]);
  return shownView.load === load ? shownView.view : null;
}
