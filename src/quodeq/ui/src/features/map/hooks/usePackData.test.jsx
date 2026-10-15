import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import useMapActivity from './useMapActivity.js';
import useSeverityWeights from './useSeverityWeights.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../viz/core/mapBadness.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { ERROR_RETRY_MS } from '../../../hooks/queryDefaults.js';

const PAYLOAD = { activitySource: 'estimated', fileNames: ['a.py'], frames: [{ files: [[0, 0, 0, 0, 0, 0, 3, 1, 0]] }] };

describe('useMapActivity', () => {
  it('decodes the latest frame of a local project', async () => {
    const getMapHistory = vi.fn(async () => PAYLOAD);
    const { result } = renderHook(() => useMapActivity('p', PROJECT_SOURCE.LOCAL), { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.activity.source).toBe('estimated'));
    expect(result.current.activity.editsByPath.get('a.py')).toBe(3);
    expect(getMapHistory).toHaveBeenCalledWith('p', 'latest');
  });

  it('a shared project reads the shared clone\'s history', async () => {
    const getMapHistory = vi.fn();
    const sharedGetMapHistory = vi.fn(async () => ({ activitySource: 'estimated', fileNames: ['a.py'], frames: [{ files: [[0, 1, 1, 0, 0, 0, 3, 0]] }] }));
    const { result } = renderHook(() => useMapActivity('p', PROJECT_SOURCE.SHARED), { wrapper: withStableQueryApi({ getMapHistory, sharedGetMapHistory }) });
    await waitFor(() => expect(result.current.activity.source).toBe('estimated'));
    expect(getMapHistory).not.toHaveBeenCalled();
  });

  it('a failing endpoint is no activity, flagged as failed', async () => {
    const getMapHistory = vi.fn(async () => { throw new Error('boom'); });
    const { result } = renderHook(() => useMapActivity('p', PROJECT_SOURCE.LOCAL), { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.activity.source).toBe('none');
  });

  it('never fetches while the Circle Pack is not the active view', () => {
    const getMapHistory = vi.fn();
    renderHook(() => useMapActivity('p', PROJECT_SOURCE.LOCAL, false), { wrapper: withStableQueryApi({ getMapHistory }) });
    expect(getMapHistory).not.toHaveBeenCalled();
  });
});

describe('useMapActivity recovery', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('a failed fetch recovers in-session once the endpoint answers', async () => {
    vi.useFakeTimers();
    const state = { fail: true };
    const getMapHistory = vi.fn(async () => { if (state.fail) throw new Error('boom'); return PAYLOAD; });
    const { result } = renderHook(() => useMapActivity('p', PROJECT_SOURCE.LOCAL), { wrapper: withStableQueryApi({ getMapHistory }) });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.failed).toBe(true);
    state.fail = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(ERROR_RETRY_MS + 1); });
    expect(result.current.failed).toBe(false);
    expect(result.current.activity.source).toBe('estimated');
  });
});

describe('useSeverityWeights', () => {
  it('uses the saved formula weights', async () => {
    const getGradeFormula = vi.fn(async () => ({ current: { severityWeight: { critical: 5, major: 3, minor: 1 } } }));
    const { result } = renderHook(() => useSeverityWeights('p'), { wrapper: withStableQueryApi({ getGradeFormula }) });
    await waitFor(() => expect(result.current.critical).toBe(5));
  });

  it('falls back to the defaults while loading', () => {
    const getGradeFormula = vi.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useSeverityWeights('p'), { wrapper: withStableQueryApi({ getGradeFormula }) });
    expect(result.current).toEqual(DEFAULT_SEVERITY_WEIGHTS);
  });
});
