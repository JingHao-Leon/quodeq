import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useMapTimelapse from './useMapTimelapse.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { TIMELAPSE_STATUS, HOLD_MS } from '../model/timelapsePlayback.js';
import { GRANULARITY } from '../../../utils/granularity.js';

const frame = (day) => ({ day, new: 1, fixed: 0, areas: [], files: [], gone: [] });
// Two ISO weeks: runs 0-1 in the week of Mon 7 Sep, runs 2-3 in the week of Mon 14 Sep.
const PAYLOAD = {
  activitySource: 'git', fileNames: ['a.py'], fileArea: ['x'], fileLayer: [''], frameEncoding: 'delta',
  frames: [frame('2026-09-07'), frame('2026-09-09'), frame('2026-09-14'), frame('2026-09-16')],
};
afterEach(() => { vi.useRealTimers(); });

/** The hook under the app's grouping: `granularity` as the Overview has it, its change handed back. */
async function setup(granularity) {
  const onGranularityChange = vi.fn();
  const fake = { getMapHistory: vi.fn().mockResolvedValue(PAYLOAD) };
  const hook = renderHook((p) => useMapTimelapse(p), {
    initialProps: { project: 'p1', source: 'local', active: true, granularity, onGranularityChange },
    wrapper: withStableQueryApi(fake),
  });
  await waitFor(() => expect(hook.result.current.status).toBe(TIMELAPSE_STATUS.READY));
  return { ...hook, onGranularityChange };
}

describe('useMapTimelapse: frames by period', () => {
  it('without a grouping it plays day by day, one frame per run', async () => {
    const { result } = await setup(undefined);
    expect(result.current.frames.period).toBe(GRANULARITY.DAY);
    expect(result.current.frames.runs).toHaveLength(4);
  });

  it('by week the bar gets one frame per week while the views keep the whole history', async () => {
    const { result } = await setup(GRANULARITY.WEEK);
    expect(result.current.frames.runs.map((r) => r.day)).toEqual(['2026-09-09', '2026-09-16']);
    expect(result.current.data.runs).toHaveLength(4);
    expect([result.current.frames.position, result.current.position, result.current.past]).toEqual([1, 3, false]);
  });

  it('the views are sent the history run of the frame shown, and the next frame\'s run to lay out ahead', async () => {
    const { result } = await setup(GRANULARITY.WEEK);
    act(() => result.current.controls.first());
    expect([result.current.frames.position, result.current.position, result.current.nextPosition]).toEqual([0, 1, 3]);
  });

  it('a view settling on a history run counts as its frame settling: playback moves on', async () => {
    const { result } = await setup(GRANULARITY.WEEK);
    act(() => result.current.controls.toggle());
    vi.useFakeTimers();
    act(() => result.current.onSettled(1));
    act(() => { vi.advanceTimersByTime(HOLD_MS); });
    expect([result.current.frames.position, result.current.position]).toEqual([1, 3]);
  });

  it('picking a period goes to the app\'s grouping, and the new frames open on the day shown', async () => {
    const { result, rerender, onGranularityChange } = await setup(GRANULARITY.DAY);
    act(() => result.current.controls.seek(1));
    act(() => result.current.frames.setPeriod(GRANULARITY.WEEK));
    expect(onGranularityChange).toHaveBeenCalledWith(GRANULARITY.WEEK);
    rerender({ project: 'p1', source: 'local', active: true, granularity: GRANULARITY.WEEK, onGranularityChange });
    expect([result.current.frames.position, result.current.position, result.current.playing]).toEqual([0, 1, false]);
  });

  it('a grouping changed elsewhere (the Overview) opens the new frames on the latest', async () => {
    const { result, rerender } = await setup(GRANULARITY.DAY);
    act(() => result.current.controls.seek(1));
    rerender({ project: 'p1', source: 'local', active: true, granularity: GRANULARITY.WEEK });
    expect([result.current.frames.position, result.current.position]).toEqual([1, 3]);
  });
});
