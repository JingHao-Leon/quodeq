import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { useRunDashboard } from './useDashboard.js';

function wrapperWith(api, seed) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (seed) client.setQueryData(seed.key, seed.data);
  return ({ children }) => <QueryClientProvider client={client}><ApiProvider value={api}>{children}</ApiProvider></QueryClientProvider>;
}

describe('useRunDashboard', () => {
  it('reads the named run\'s dashboard', async () => {
    const api = { getDashboard: vi.fn(async (project, run) => ({ selectedRun: { runId: run }, dimensions: [] })) };
    const { result } = renderHook(() => useRunDashboard({ project: 'p', runId: 'r1' }), { wrapper: wrapperWith(api) });
    await waitFor(() => expect(result.current?.selectedRun.runId).toBe('r1'));
    expect(api.getDashboard).toHaveBeenCalledWith('p', 'r1');
  });

  // Regression: without a run the key names the latest run's entry, which the
  // app's own dashboard query fills; a run with no previous run read the
  // latest run's numbers as its baseline.
  it('reads nothing without a run, even with the latest run\'s dashboard cached', () => {
    const api = { getDashboard: vi.fn() };
    const seed = { key: projectKeys.dashboard('p', null, 'local'), data: { selectedRun: { runId: 'latest-run' }, dimensions: [{}] } };
    const { result } = renderHook(() => useRunDashboard({ project: 'p', runId: null }), { wrapper: wrapperWith(api, seed) });
    expect(result.current).toBeNull();
    expect(api.getDashboard).not.toHaveBeenCalled();
  });
});
