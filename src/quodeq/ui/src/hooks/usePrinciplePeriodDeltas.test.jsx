import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePrinciplePeriodDeltas, previousPeriodRunId, principleChanges } from './usePrinciplePeriodDeltas.js';
import { withStableQueryApi } from '../test-utils/withQueryClient.jsx';

const run = (runId, dateISO) => ({ runId, dateISO, status: 'completed', dimensionDetails: [{ dimension: 'security', score: 7 }] });
// Newest first, one run a day.
const TREND = [run('r3', '2026-10-14T10:00:00'), run('r2', '2026-10-13T10:00:00'), run('r1', '2026-10-12T10:00:00')];
const NOW = [{ principle: 'Input Validation', score: '7.5' }, { principle: 'Secrets', score: '6.0' }];

describe('previousPeriodRunId', () => {
  it('is the run that closes the period before the one on show', () => {
    expect(previousPeriodRunId({ trend: TREND, dimension: 'security', granularity: 'day', activeRunId: null })).toBe('r2');
    expect(previousPeriodRunId({ trend: TREND, dimension: 'security', granularity: 'day', activeRunId: 'r2' })).toBe('r1');
  });

  it('is null with no previous period', () => {
    expect(previousPeriodRunId({ trend: TREND, dimension: 'security', granularity: 'day', activeRunId: 'r1' })).toBeNull();
    expect(previousPeriodRunId({ trend: [], dimension: 'security', granularity: 'day', activeRunId: null })).toBeNull();
  });
});

describe('principleChanges', () => {
  it('matches principles by name whatever their case, in the slim shape', () => {
    const previous = { principles: [{ principle: 'input validation', score: '7.0/10' }, { name: 'SECRETS', score: '6.5' }] };
    expect([...principleChanges(previous, NOW)]).toEqual([['Input Validation', 0.5], ['Secrets', -0.5]]);
  });

  it('reads the eval shape too, and leaves out a principle missing from either side', () => {
    const previous = { principleGrades: [{ principle: 'Input Validation', score: 8 }, { principle: 'Gone', score: 5 }] };
    expect([...principleChanges(previous, NOW)]).toEqual([['Input Validation', -0.5]]);
  });

  it('is empty without a previous run', () => {
    expect(principleChanges(null, NOW).size).toBe(0);
  });
});

describe('usePrinciplePeriodDeltas', () => {
  const args = { project: 'p1', trend: TREND, dimension: 'security', granularity: 'day', activeRunId: null, principles: NOW };

  it('fetches the previous period\'s run once and hands back its dimension', async () => {
    const dim = { dimension: 'Security', principles: [{ principle: 'Secrets', score: '5.0' }], totals: { violationCount: 3 }, filesRead: 9 };
    const getRunScores = vi.fn(async () => ({ dimensions: [dim] }));
    const { result } = renderHook(() => usePrinciplePeriodDeltas(args), { wrapper: withStableQueryApi({ getRunScores }) });
    await waitFor(() => expect(result.current.previous).toEqual(dim));
    expect(getRunScores).toHaveBeenCalledWith('p1', 'r2', { keepArchived: true });
    expect(result.current.principles.get('Secrets')).toBe(1);
    expect(result.current.beforeRunId).toBe('r2');
  });

  it('asks nothing without a previous period', () => {
    const getRunScores = vi.fn();
    const { result } = renderHook(() => usePrinciplePeriodDeltas({ ...args, activeRunId: 'r1' }), { wrapper: withStableQueryApi({ getRunScores }) });
    expect(getRunScores).not.toHaveBeenCalled();
    expect(result.current).toEqual({ principles: new Map(), previous: null, beforeRunId: null });
  });
});
