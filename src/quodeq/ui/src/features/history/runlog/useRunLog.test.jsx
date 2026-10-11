import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { useRunLog, RUN_LOG_POLL_MS, RUN_LOG_MAX_IDLE_POLLS } from './useRunLog.js';

describe('useRunLog', () => {
  it('polls while counts are pending and stops when they land', async () => {
    const getRunLog = vi.fn()
      .mockResolvedValueOnce({ runs: [{ runId: 'a', pending: true }], running: null })
      .mockResolvedValue({ runs: [{ runId: 'a', pending: false, counts: { new: 1, resolved: 0 } }], running: null });
    const { result } = renderHook(() => useRunLog('p1'), { wrapper: withStableQueryApi({ getRunLog }) });
    await waitFor(() => expect(result.current.runs[0]?.counts?.new).toBe(1), { timeout: 5000 });
    const calls = getRunLog.mock.calls.length;
    await new Promise((r) => setTimeout(r, 2500));
    expect(getRunLog.mock.calls.length).toBe(calls);
  });

  describe('a run that stays pending', () => {
    afterEach(() => vi.useRealTimers());

    it('stops polling after the idle budget, a manual refetch starts it again', async () => {
      vi.useFakeTimers();
      const getRunLog = vi.fn(async () => ({ runs: [{ runId: 'a', pending: true }], running: null }));
      const { result } = renderHook(() => useRunLog('p1'), { wrapper: withStableQueryApi({ getRunLog }) });
      const budget = RUN_LOG_MAX_IDLE_POLLS ?? 90;
      for (let i = 0; i < budget + 10; i++) await act(() => vi.advanceTimersByTimeAsync(RUN_LOG_POLL_MS));
      const stopped = getRunLog.mock.calls.length;
      expect(stopped).toBeLessThanOrEqual(budget + 2);
      await act(() => vi.advanceTimersByTimeAsync(RUN_LOG_POLL_MS * 5));
      expect(getRunLog.mock.calls.length).toBe(stopped);
      await act(async () => { await result.current.refetch(); });
      await act(() => vi.advanceTimersByTimeAsync(RUN_LOG_POLL_MS * 3));
      expect(getRunLog.mock.calls.length).toBeGreaterThan(stopped + 1);
    });
  });
});
