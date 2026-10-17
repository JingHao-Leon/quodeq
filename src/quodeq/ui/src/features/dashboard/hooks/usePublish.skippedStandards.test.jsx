import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePublish } from './usePublish.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { standardsKeys } from '../../../api/queryKeys.js';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { SidePaneContext } from '../../side-pane/SidePaneContext.jsx';

// A project publish leaves alone every standard whose shared copy is newer
// and reports them as skippedStandards; the user is told which ones.
async function publishUntilDone(skippedStandards, cachedStandards) {
  const showToast = vi.fn();
  const getSharedStatus = vi.fn(async () => ({ configured: true, publish: { state: 'done', project: 'p1', runs: 1, skippedStandards } }));
  const api = {
    getSharedStatus,
    sharedListProjects: vi.fn(async () => ({ projects: [], lastSynced: null, stale: false })),
    publishProject: vi.fn(async () => ({ started: true })),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cachedStandards) client.setQueryData(standardsKeys.list(), cachedStandards);
  const wrapper = ({ children }) => (
    <QueryClientProvider client={client}><ApiProvider value={api}><SidePaneContext.Provider value={{ showToast }}>{children}</SidePaneContext.Provider></ApiProvider></QueryClientProvider>
  );
  const { result } = renderHook(() => usePublish({ enabled: false }), { wrapper });
  await act(async () => { await result.current.publish('p1'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  return { showToast, result };
}

describe('usePublish skipped standards', () => {
  it('names the skipped standards in a toast when the publish finishes', async () => {
    vi.useFakeTimers();
    try {
      const { showToast, result } = await publishUntilDone(['android']);
      expect(result.current.publishState).toBe('done');
      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast.mock.calls[0][0]).toContain('android');
    } finally {
      vi.useRealTimers();
    }
  });

  it('names the skipped standards by name when the list is cached, by id otherwise', async () => {
    vi.useFakeTimers();
    try {
      const { showToast } = await publishUntilDone(['android', 'zzz'], [{ id: 'android', name: 'Android Guide' }]);
      expect(showToast.mock.calls[0][0]).toContain('Android Guide, zzz');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no toast when nothing was skipped', async () => {
    vi.useFakeTimers();
    try {
      const { showToast, result } = await publishUntilDone([]);
      expect(result.current.publishState).toBe('done');
      expect(showToast).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
