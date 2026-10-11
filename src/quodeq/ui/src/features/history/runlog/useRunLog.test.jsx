import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { useRunLog } from './useRunLog.js';

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
});
