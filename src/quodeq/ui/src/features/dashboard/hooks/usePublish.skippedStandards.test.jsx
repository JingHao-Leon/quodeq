import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePublish } from './usePublish.js';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { SidePaneContext } from '../../side-pane/SidePaneContext.jsx';

// A project publish leaves alone every standard whose shared copy is newer
// and reports them as skippedStandards; the user is told which ones.
async function publishUntilDone(skippedStandards) {
  const showToast = vi.fn();
  const getSharedStatus = vi.fn(async () => ({ configured: true, publish: { state: 'done', project: 'p1', runs: 1, skippedStandards } }));
  const api = {
    getSharedStatus,
    sharedListProjects: vi.fn(async () => ({ projects: [], lastSynced: null, stale: false })),
    publishProject: vi.fn(async () => ({ started: true })),
  };
  const QC = withQueryClient();
  const wrapper = ({ children }) => (
    <QC><ApiProvider value={api}><SidePaneContext.Provider value={{ showToast }}>{children}</SidePaneContext.Provider></ApiProvider></QC>
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
