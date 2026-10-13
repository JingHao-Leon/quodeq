import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useMapTimelapse from './useMapTimelapse.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { TIMELAPSE_STATUS, HOLD_MS } from '../model/timelapsePlayback.js';

const frame = (day, files) => ({ day, new: 0, fixed: 0, areas: [], files, gone: [] });
const PAYLOAD = {
  activitySource: 'git', fileNames: ['a.py'], fileArea: ['x'], fileLayer: [''], frameEncoding: 'delta',
  frames: [frame('2026-09-01', [[0, 1, 1, 1, 0, 0, 0, 0]]), frame('2026-09-08', []), frame('2026-09-15', [])],
};
const api = () => ({ getMapHistory: vi.fn().mockResolvedValue(PAYLOAD) });
afterEach(() => { vi.useRealTimers(); });

function setup(props, fake = api()) {
  const hook = renderHook((p) => useMapTimelapse(p), { initialProps: { project: 'p1', source: 'local', active: true, ...props }, wrapper: withStableQueryApi(fake) });
  return { ...hook, fake };
}

describe('useMapTimelapse', () => {
  it('is off for a shared project and never fetches', () => {
    const { result, fake } = setup({ source: 'shared' });
    expect(result.current.status).toBe(TIMELAPSE_STATUS.OFF);
    expect(fake.getMapHistory).not.toHaveBeenCalled();
  });

  it('loads every frame and opens on the latest run', async () => {
    const { result, fake } = setup();
    await waitFor(() => expect(result.current.status).toBe(TIMELAPSE_STATUS.READY));
    expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'all');
    expect([result.current.position, result.current.past]).toEqual([2, false]);
  });

  it('plays: the first run, then the next once the view settled and the hold passed', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe(TIMELAPSE_STATUS.READY));
    act(() => result.current.controls.toggle());
    expect([result.current.position, result.current.past]).toEqual([0, true]);
    vi.useFakeTimers();
    act(() => result.current.onSettled(0));
    act(() => { vi.advanceTimersByTime(HOLD_MS); });
    expect(result.current.position).toBe(1);
  });

  it('pauses when the map view leaves, and returns to the latest run when blocked', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.status).toBe(TIMELAPSE_STATUS.READY));
    act(() => result.current.controls.toggle());
    rerender({ project: 'p1', source: 'local', active: false });
    expect(result.current.playing).toBe(false);
    rerender({ project: 'p1', source: 'local', active: true, blocked: true });
    expect([result.current.position, result.current.past]).toEqual([2, false]);
  });

  it('leaving the map views mid-playback pauses on the run it reached', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.status).toBe(TIMELAPSE_STATUS.READY));
    act(() => result.current.controls.toggle());
    rerender({ project: 'p1', source: 'local', active: false });
    expect([result.current.playing, result.current.position]).toEqual([false, 0]);
  });

  it('a Dimensions filter mid-playback stops it and shows the latest run', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.status).toBe(TIMELAPSE_STATUS.READY));
    act(() => result.current.controls.toggle());
    rerender({ project: 'p1', source: 'local', active: true, blocked: true });
    expect([result.current.playing, result.current.position, result.current.past]).toEqual([false, 2, false]);
    rerender({ project: 'p1', source: 'local', active: true, blocked: false });
    expect([result.current.playing, result.current.position, result.current.past]).toEqual([false, 2, false]);
  });

  it('play pressed while blocked never starts a playback that cannot advance', async () => {
    const { result } = setup({ blocked: true });
    await waitFor(() => expect(result.current.status).toBe(TIMELAPSE_STATUS.READY));
    act(() => result.current.controls.toggle());
    expect([result.current.playing, result.current.position, result.current.past]).toEqual([false, 2, false]);
  });
});
