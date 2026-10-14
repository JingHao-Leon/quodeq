import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { easeInOut, lerpTransform, useTweenedTransform, useFollowingTransform, useFadeTween, PACK_TWEEN_MS, FADE_TWEEN_MS } from './packTween.js';

const A = { k: 1, tx: 0, ty: 0 };
const B = { k: 3, tx: -100, ty: -50 };
const HALF = 0.5;

describe('easeInOut', () => {
  it('is clamped, symmetric and passes through the midpoint', () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(HALF)).toBeCloseTo(HALF);
    expect(easeInOut(0.25)).toBeCloseTo(1 - easeInOut(0.75));
  });
});

describe('lerpTransform', () => {
  it('interpolates every component', () => {
    expect(lerpTransform(A, B, 0)).toEqual(A);
    expect(lerpTransform(A, B, 1)).toEqual(B);
    expect(lerpTransform(A, B, HALF)).toEqual({ k: 2, tx: -50, ty: -25 });
  });
});

// Drive requestAnimationFrame by hand: each `tick(ms)` runs the queued
// frame with a clock advanced by that much.
function fakeFrames() {
  let now = 0;
  let queued = null;
  vi.stubGlobal('requestAnimationFrame', (cb) => { queued = cb; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => { queued = null; });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  return {
    tick(ms) {
      now += ms;
      const cb = queued;
      queued = null;
      cb?.(now);
    },
    hasFrame: () => queued !== null,
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useTweenedTransform', () => {
  it('eases from the previous transform to the target over the tween window', () => {
    const frames = fakeFrames();
    const skip = { current: false };
    const { result, rerender } = renderHook(({ target }) => useTweenedTransform(target, skip), { initialProps: { target: A } });
    expect(result.current).toBe(A);

    rerender({ target: B });
    expect(result.current).toBe(A);
    act(() => frames.tick(PACK_TWEEN_MS / 2));
    expect(result.current.k).toBeGreaterThan(A.k);
    expect(result.current.k).toBeLessThan(B.k);
    act(() => frames.tick(PACK_TWEEN_MS));
    expect(result.current).toBe(B);
    expect(frames.hasFrame()).toBe(false);
  });

  it('snaps when transitions are skipped or motion is reduced', () => {
    const frames = fakeFrames();
    const skip = { current: true };
    const { result, rerender } = renderHook(({ target }) => useTweenedTransform(target, skip), { initialProps: { target: A } });
    rerender({ target: B });
    expect(result.current).toBe(B);
    expect(frames.hasFrame()).toBe(false);

    skip.current = false;
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    rerender({ target: A });
    expect(result.current).toBe(A);
    expect(frames.hasFrame()).toBe(false);
  });

  // The worker reply swaps the placeholder root for the real one; the focus
  // transform is rebuilt with the same values. The canvas treats
  // `shown === target` as "settled", so the new object must be adopted.
  it('adopts an equal-valued target without animating', () => {
    const frames = fakeFrames();
    const skip = { current: false };
    const { result, rerender } = renderHook(({ target }) => useTweenedTransform(target, skip), { initialProps: { target: A } });
    const sameAsA = { ...A };
    rerender({ target: sameAsA });
    expect(result.current).toBe(sameAsA);
    expect(frames.hasFrame()).toBe(false);
  });
});

describe('useFollowingTransform', () => {
  const C = { k: 3, tx: -90, ty: -40 };
  const follow = (props) => renderHook(({ target, key }) => useFollowingTransform(target, key), { initialProps: props });

  it('follows a moving target at once while the key stays the same', () => {
    const frames = fakeFrames();
    const { result, rerender } = follow({ target: B, key: 1 });
    rerender({ target: C, key: 1 });
    expect(result.current).toBe(C);
    expect(frames.hasFrame()).toBe(false);
  });

  it('eases from the camera shown to the live target when the key changes', () => {
    const frames = fakeFrames();
    const { result, rerender } = follow({ target: A, key: 0 });
    rerender({ target: B, key: 1 });
    expect(result.current).toEqual(A);
    act(() => frames.tick(PACK_TWEEN_MS / 2));
    expect(result.current.k).toBeGreaterThan(A.k);
    expect(result.current.k).toBeLessThan(B.k);
    // The target moves mid-zoom (a run moving under it): the zoom lands on where it is now.
    rerender({ target: C, key: 1 });
    act(() => frames.tick(PACK_TWEEN_MS));
    expect(result.current).toBe(C);
    expect(frames.hasFrame()).toBe(false);
  });

  it('snaps to the new key under reduced motion', () => {
    const frames = fakeFrames();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { result, rerender } = follow({ target: A, key: 0 });
    rerender({ target: B, key: 1 });
    expect(result.current).toBe(B);
    expect(frames.hasFrame()).toBe(false);
  });
});

describe('useFadeTween', () => {
  const LOW = Float32Array.from([1, 0.15]);
  const HIGH = Float32Array.from([1, 1]);
  const fade = (target) => renderHook(({ t }) => useFadeTween(t), { initialProps: { t: target } });

  it('eases each opacity toward the new target', () => {
    const frames = fakeFrames();
    const { result, rerender } = fade(LOW);
    rerender({ t: HIGH });
    act(() => frames.tick(FADE_TWEEN_MS / 2));
    expect(result.current[1]).toBeGreaterThan(0.15);
    expect(result.current[1]).toBeLessThan(1);
    act(() => frames.tick(FADE_TWEEN_MS));
    expect(result.current).toBe(HIGH);
  });

  it('snaps under reduced motion and when the circles change', () => {
    const frames = fakeFrames();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { result, rerender } = fade(LOW);
    rerender({ t: HIGH });
    expect(result.current).toBe(HIGH);
    const more = Float32Array.from([1, 1, 0.15]);
    rerender({ t: more });
    expect(result.current).toBe(more);
    expect(frames.hasFrame()).toBe(false);
  });
});
