import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRunTransition } from './useRunTransition.js';
import { TRANSITION } from '../core/timelapseScene.js';

const load = (k) => Promise.resolve(`run ${k}`);
const kindOf = () => TRANSITION.MOVE;
const flush = () => act(async () => { await Promise.resolve(); });
afterEach(() => { vi.useRealTimers(); });

function setup(durationMs, onSettled = vi.fn()) {
  const hook = renderHook(({ target }) => useRunTransition({ target, load, kindOf, durationMs, onSettled }), { initialProps: { target: 0 } });
  return { ...hook, onSettled };
}

describe('useRunTransition', () => {
  it('the first run is shown settled at once', async () => {
    const { result, onSettled } = setup(900);
    await flush();
    expect([result.current.from, result.current.to.state]).toEqual([null, 'run 0']);
    expect(onSettled).toHaveBeenCalledWith(0);
  });

  it('a move runs from the shown run to the target, then settles', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { result, rerender, onSettled } = setup(900);
    await flush();
    rerender({ target: 1 });
    await flush();
    act(() => { vi.advanceTimersByTime(450); });
    expect([result.current.from.k, result.current.to.k, result.current.kind]).toEqual([0, 1, TRANSITION.MOVE]);
    expect(result.current.t).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(600); });
    expect([result.current.from, onSettled.mock.calls.at(-1)[0]]).toEqual([null, 1]);
  });

  it('a new target mid-move starts from the nearer end of the interrupted move', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { result, rerender } = setup(900);
    await flush();
    rerender({ target: 1 });
    await flush();
    act(() => { vi.advanceTimersByTime(700); });
    rerender({ target: 2 });
    await flush();
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.from.k).toBe(1);
  });

  it('a new target early in a move starts from the run the move left', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { result, rerender } = setup(900);
    await flush();
    rerender({ target: 1 });
    await flush();
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ target: 2 });
    await flush();
    act(() => { vi.advanceTimersByTime(100); });
    expect([result.current.from.k, result.current.to.k]).toEqual([0, 2]);
  });

  it('another history starts settled instead of moving from the old one', async () => {
    const onSettled = vi.fn();
    const hook = renderHook(({ target, from }) => useRunTransition({ target, load: from, kindOf, durationMs: 900, onSettled }),
      { initialProps: { target: 0, from: load } });
    await flush();
    hook.rerender({ target: 1, from: (k) => Promise.resolve(`other ${k}`) });
    await flush();
    expect([hook.result.current.from, hook.result.current.to.state]).toEqual([null, 'other 1']);
  });

  it('with no motion every run settles at once', async () => {
    const { result, rerender } = setup(0);
    await flush();
    rerender({ target: 1 });
    await flush();
    expect([result.current.from, result.current.to.k]).toEqual([null, 1]);
  });

  it('a run that fails to load keeps the view and says why instead of an unhandled rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onSettled = vi.fn();
    const failing = () => Promise.reject(new Error('layout failed'));
    const hook = renderHook(() => useRunTransition({ target: 0, load: failing, kindOf, durationMs: 0, onSettled }));
    await flush();
    await flush();
    expect([hook.result.current, onSettled.mock.calls.length, warn.mock.calls.length]).toEqual([null, 0, 1]);
    warn.mockRestore();
  });

  it('a load that throws is handled like one that rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing = () => { throw new Error('no scene'); };
    const hook = renderHook(() => useRunTransition({ target: 0, load: throwing, kindOf, durationMs: 0, onSettled: vi.fn() }));
    await flush();
    await flush();
    expect([hook.result.current, warn.mock.calls.length]).toEqual([null, 1]);
    warn.mockRestore();
  });
});
