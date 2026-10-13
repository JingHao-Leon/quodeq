import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSkyTimeline from './useSkyTimeline.js';
import { decodeTimelapse, NO_TIMELAPSE } from '../model/mapTimelapse.js';

const PATHS = ['app/a.py', 'app/b.py', 'app/c.py', 'app/d.py', 'app/e.py'];
const row = (i) => [i, 1, 1, 1, 0, 0, 0, 0];
const frame = (day) => ({ day, new: 0, fixed: 0, areas: [{ area: 'app', kind: 'watch', density: 0.5, touchedShare: 0 }], files: [0, 1, 2, 3, 4].map(row), gone: [] });
const DAYS = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'];
const history = (days) => decodeTimelapse({
  activitySource: 'git', fileNames: PATHS, fileArea: PATHS.map(() => 'app'), fileLayer: PATHS.map(() => ''), frameEncoding: 'delta',
  frames: days.map(frame),
});

let idle;
beforeEach(() => {
  idle = new Map();
  let id = 0;
  vi.stubGlobal('requestIdleCallback', (fn) => { id += 1; idle.set(id, fn); return id; });
  vi.stubGlobal('cancelIdleCallback', (handle) => { idle.delete(handle); });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Runs every pending idle slice until none is left. */
function drainIdle() {
  act(() => {
    while (idle.size) {
      const [handle, fn] = idle.entries().next().value;
      idle.delete(handle);
      fn({ timeRemaining: () => 1 });
    }
  });
}

describe('useSkyTimeline', () => {
  it('warms every run in idle slices once the history is in', () => {
    const data = history(DAYS);
    const { result } = renderHook(() => useSkyTimeline(data));
    expect(result.current.progress().settled).toBe(0);
    expect(idle.size).toBe(1);
    drainIdle();
    expect(result.current.progress()).toEqual({ summarized: DAYS.length, settled: DAYS.length, total: DAYS.length });
  });

  it('does not warm without a history to seek in', () => {
    renderHook(() => useSkyTimeline(NO_TIMELAPSE));
    expect(idle.size).toBe(0);
  });

  it('stops warming when the Risk tab is left (unmount)', () => {
    const data = history(DAYS);
    const { result, unmount } = renderHook(() => useSkyTimeline(data));
    unmount();
    expect(idle.size).toBe(0);
    expect(result.current.progress().summarized).toBe(0);
  });

  it('stops warming the old history when the data changes, and warms the new one', () => {
    const first = history(DAYS);
    const { result, rerender } = renderHook(({ data }) => useSkyTimeline(data), { initialProps: { data: first } });
    const old = result.current;
    const next = history(DAYS.slice(0, 3));
    rerender({ data: next });
    expect(result.current).not.toBe(old);
    drainIdle();
    expect(old.progress().summarized).toBe(0);
    expect(result.current.progress().settled).toBe(3);
  });

  it('keeps the same timeline across renders of the same history', () => {
    const data = history(DAYS);
    const { result, rerender } = renderHook(() => useSkyTimeline(data));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
