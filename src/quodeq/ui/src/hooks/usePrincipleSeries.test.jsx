import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../api/ApiContext.jsx';
import { projectKeys } from '../api/queryKeys.js';
import { PROJECT_SOURCE } from '../vocab/projectSource.js';
import { usePrincipleSeries } from './usePrincipleSeries.js';

const ROWS = [{ runId: 'r2', dateISO: '2026-10-02T10:00:00Z', dateLabel: '2 Oct', principles: [] }];

function setup(api) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={client}><ApiProvider value={api}>{children}</ApiProvider></QueryClientProvider>
  );
  return { client, wrapper };
}

describe('usePrincipleSeries', () => {
  it('reads the local series of the dimension', async () => {
    const getPrincipleSeries = vi.fn(async () => ({ dimension: 'security', rows: ROWS }));
    const { wrapper } = setup({ getPrincipleSeries, sharedGetPrincipleSeries: vi.fn() });
    const { result } = renderHook(() => usePrincipleSeries('p1', PROJECT_SOURCE.LOCAL, 'security'), { wrapper });
    await waitFor(() => expect(result.current.rows).toEqual(ROWS));
    expect(getPrincipleSeries).toHaveBeenCalledWith('p1', 'security');
  });

  it('reads a shared project from the shared clone', async () => {
    const sharedGetPrincipleSeries = vi.fn(async () => ({ dimension: 'security', rows: ROWS }));
    const { wrapper } = setup({ getPrincipleSeries: vi.fn(), sharedGetPrincipleSeries });
    const { result } = renderHook(() => usePrincipleSeries('p1', PROJECT_SOURCE.SHARED, 'security'), { wrapper });
    await waitFor(() => expect(result.current.rows).toEqual(ROWS));
    expect(sharedGetPrincipleSeries).toHaveBeenCalledWith('p1', 'security');
  });

  it('asks nothing without a dimension and hands back no rows', () => {
    const getPrincipleSeries = vi.fn();
    const { wrapper } = setup({ getPrincipleSeries, sharedGetPrincipleSeries: vi.fn() });
    const { result } = renderHook(() => usePrincipleSeries('p1', PROJECT_SOURCE.LOCAL, null), { wrapper });
    expect(getPrincipleSeries).not.toHaveBeenCalled();
    expect(result.current).toEqual({ rows: [], loading: false, error: null });
  });

  it('refetches when the project subtree is invalidated (a dismiss or a formula change)', async () => {
    const getPrincipleSeries = vi.fn(async () => ({ dimension: 'security', rows: ROWS }));
    const { client, wrapper } = setup({ getPrincipleSeries, sharedGetPrincipleSeries: vi.fn() });
    const { result } = renderHook(() => usePrincipleSeries('p1', PROJECT_SOURCE.LOCAL, 'security'), { wrapper });
    await waitFor(() => expect(result.current.rows).toEqual(ROWS));
    await act(() => client.invalidateQueries({ queryKey: projectKeys.project('p1', PROJECT_SOURCE.LOCAL) }));
    expect(getPrincipleSeries).toHaveBeenCalledTimes(2);
  });
});
