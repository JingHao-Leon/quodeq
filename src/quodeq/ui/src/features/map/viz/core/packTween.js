import { useEffect, useRef, useState } from 'react';

// The canvas zooms by tweening the focus transform itself over this long.
export const PACK_TWEEN_MS = 500;
const HALF = 0.5;
const CUBIC = 3;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Cubic ease-in-out on [0, 1]. */
export function easeInOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Second half mirrors the first: ease out of the remaining distance.
  return t < HALF ? (2 * t) ** CUBIC / 2 : 1 - (2 * (1 - t)) ** CUBIC / 2;
}

/** Interpolate two `{ k, tx, ty }` transforms. */
export function lerpTransform(from, to, t) {
  return {
    k: from.k + (to.k - from.k) * t,
    tx: from.tx + (to.tx - from.tx) * t,
    ty: from.ty + (to.ty - from.ty) * t,
  };
}

function sameTransform(a, b) {
  return a.k === b.k && a.tx === b.tx && a.ty === b.ty;
}

/** Whether the user asked for no motion (also true without matchMedia). */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Calls `onFrame(t)` on every animation frame, `t` going from 0 to 1 over `durationMs`; returns the cancel. */
function playFrames(durationMs, onFrame) {
  let frame = 0;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    onFrame(t);
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

/**
 * The focus transform as currently displayed: snaps to `target` when
 * `skip.current` is set (first paint, breadcrumb jumps) or under reduced
 * motion, otherwise eases from the previous value over PACK_TWEEN_MS.
 */
export function useTweenedTransform(target, skip) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    // Same values, new object (the root arriving from the worker): adopt it
    // so callers comparing identity see the tween as settled.
    if (sameTransform(from, target) || skip?.current || prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    return playFrames(PACK_TWEEN_MS, (raw) => {
      const t = easeInOut(raw);
      const next = t >= 1 ? target : lerpTransform(from, target, t);
      shownRef.current = next;
      setShown(next);
    });
  }, [target, skip]);

  return shown;
}

/**
 * The camera on a target that moves by itself (a time-lapse run moving under
 * it): follows `target` exactly while `key` stays the same, so it never lags
 * the run, and when `key` changes (another folder opened) eases from the
 * camera shown then to the live target over PACK_TWEEN_MS. Snaps under
 * reduced motion.
 */
export function useFollowingTransform(target, key) {
  const [move, setMove] = useState({ key, from: target, t: 1 });
  const shownRef = useRef(target);
  let current = move;
  if (move.key !== key) {
    current = { key, from: shownRef.current, t: prefersReducedMotion() ? 1 : 0 };
    setMove(current);
  }
  const moving = current.t < 1;

  useEffect(() => {
    if (!moving) return undefined;
    return playFrames(PACK_TWEEN_MS, (raw) => {
      const t = easeInOut(raw);
      setMove((m) => (m.key === key ? { ...m, t } : m));
    });
  }, [key, moving]);

  const shown = moving ? lerpTransform(current.from, target, current.t) : target;
  useEffect(() => { shownRef.current = shown; });
  return shown;
}

/** How long a brightness change of the pack takes. */
export const FADE_TWEEN_MS = 150;

/**
 * Per-circle opacities eased from what is shown toward `target`
 * over FADE_TWEEN_MS (snaps under reduced motion or when the circles change).
 * @param {Float32Array} target
 * @returns {Float32Array}
 */
export function useFadeTween(target) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return undefined;
    if (from.length !== target.length || prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    return playFrames(FADE_TWEEN_MS, (t) => {
      const next = t >= 1 ? target : target.map((v, i) => from[i] + (v - from[i]) * t);
      shownRef.current = next;
      setShown(next);
    });
  }, [target]);
  // New circles render at their target until the next change eases.
  return shown.length === target.length ? shown : target;
}
