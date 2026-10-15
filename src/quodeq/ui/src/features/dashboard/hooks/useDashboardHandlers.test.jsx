import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDashboardHandlers } from './useDashboardHandlers.js';
import { resolveActiveTab } from '../../../hooks/useAppState.js';

describe('useDashboardHandlers', () => {
  it('a run page card opens its dimension as of the run, with History still lit in the sidebar', () => {
    const onNavigate = vi.fn();
    const dashboard = { selectedRun: { runId: 'r2', dateLabel: '8 Oct 2026' } };
    const { result } = renderHook(() => useDashboardHandlers(onNavigate, dashboard));
    result.current.handleDimensionCardClick({ dimension: 'security' }, 'r2');
    const [page, params] = onNavigate.mock.calls[0];
    expect([page, params]).toEqual(['explorer', { dimension: 'security', runId: 'r2', dateLabel: '8 Oct 2026', fromProject: undefined, sourceTab: 'history' }]);
    expect(resolveActiveTab({ page, ...params })).toBe('history');
  });

  it('a scoped Findings view opened from the run page keeps History lit through the stack root', () => {
    expect(resolveActiveTab({ page: 'violations', scope: { kind: 'folder', path: 'src' }, asOf: { runId: 'r2' } }, 'history')).toBe('history');
  });

  it('does nothing without an onNavigate', () => {
    const { result } = renderHook(() => useDashboardHandlers(undefined, null));
    expect(() => result.current.handleDimensionCardClick({ dimension: 'security' }, 'r2')).not.toThrow();
  });
});
