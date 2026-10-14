import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePeriodDiffs, runsToCompare } from './usePeriodDiffs.js';
import { withStableQueryApi } from '../test-utils/withQueryClient.jsx';

describe('runsToCompare', () => {
  it('asks once per distinct run on show, never for the run compared with', () => {
    expect(runsToCompare(['r3', 'r3', null, 'r2', 'r1'], 'r1')).toEqual(['r3', 'r2']);
  });

  it('asks nothing without a previous period', () => {
    expect(runsToCompare(['r3'], null)).toEqual([]);
  });
});

describe('usePeriodDiffs', () => {
  it('compares each run on show with the run that closed the previous period', async () => {
    const api = { getRunDiff: vi.fn(async (project, run) => ({ runId: run, dimensions: {} })) };
    const { result } = renderHook(() => usePeriodDiffs({ project: 'p', runs: ['r3', 'r2', 'r3'], against: 'r1' }), { wrapper: withStableQueryApi(api) });
    await waitFor(() => expect(result.current.payloads.every(Boolean)).toBe(true));
    expect(result.current.runs).toEqual(['r3', 'r2']);
    expect(api.getRunDiff).toHaveBeenCalledWith('p', 'r3', 'r1');
    expect(api.getRunDiff).toHaveBeenCalledTimes(2);
  });

  it('fetches nothing for a shared project', () => {
    const api = { getRunDiff: vi.fn() };
    const { result } = renderHook(() => usePeriodDiffs({ project: 'p', source: 'shared', runs: ['r3'], against: 'r1' }), { wrapper: withStableQueryApi(api) });
    expect(result.current.payloads).toEqual([]);
    expect(api.getRunDiff).not.toHaveBeenCalled();
  });
});
