import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import useMapActivity from './useMapActivity.js';
import useSeverityWeights from './useSeverityWeights.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../viz/core/mapBadness.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

const PAYLOAD = { activitySource: 'estimated', fileNames: ['a.py'], frames: [{ files: [[0, 0, 0, 0, 0, 0, 3, 1, 0]] }] };

describe('useMapActivity', () => {
  it('decodes the latest frame of a local project', async () => {
    const getMapHistory = vi.fn(async () => PAYLOAD);
    const { result } = renderHook(() => useMapActivity('p', PROJECT_SOURCE.LOCAL), { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.activity.source).toBe('estimated'));
    expect(result.current.activity.editsByPath.get('a.py')).toBe(3);
    expect(getMapHistory).toHaveBeenCalledWith('p', 'latest');
  });

  it('never fetches for a shared project', () => {
    const getMapHistory = vi.fn();
    const { result } = renderHook(() => useMapActivity('p', PROJECT_SOURCE.SHARED), { wrapper: withStableQueryApi({ getMapHistory }) });
    expect(getMapHistory).not.toHaveBeenCalled();
    expect(result.current.activity.source).toBe('none');
  });

  it('a failing endpoint is no activity, flagged as failed', async () => {
    const getMapHistory = vi.fn(async () => { throw new Error('boom'); });
    const { result } = renderHook(() => useMapActivity('p', PROJECT_SOURCE.LOCAL), { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.activity.source).toBe('none');
  });
});

describe('useSeverityWeights', () => {
  it('uses the saved formula weights', async () => {
    const getGradeFormula = vi.fn(async () => ({ current: { severityWeight: { critical: 5, major: 3, minor: 1 } } }));
    const { result } = renderHook(() => useSeverityWeights('p', PROJECT_SOURCE.LOCAL), { wrapper: withStableQueryApi({ getGradeFormula }) });
    await waitFor(() => expect(result.current.critical).toBe(5));
  });

  it('falls back to the defaults while loading and for shared projects', () => {
    const getGradeFormula = vi.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useSeverityWeights('p', PROJECT_SOURCE.SHARED), { wrapper: withStableQueryApi({ getGradeFormula }) });
    expect(result.current).toEqual(DEFAULT_SEVERITY_WEIGHTS);
  });
});
