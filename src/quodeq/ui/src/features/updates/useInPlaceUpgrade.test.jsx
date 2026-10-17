import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../api/index.js', () => ({
  getUpdateStatus: vi.fn(),
  startUpgrade: vi.fn(),
  restartAfterUpgrade: vi.fn(),
}));
import { getUpdateStatus, startUpgrade, restartAfterUpgrade } from '../../api/index.js';
import { useInPlaceUpgrade } from './useInPlaceUpgrade.js';

const BASE = { latest: '1.5.0', in_place_upgrade: { supported: true, phase: 'idle', evaluations_running: 0 } };

afterEach(() => { vi.clearAllMocks(); });

describe('useInPlaceUpgrade', () => {
  it('reports blocked while evaluations run', () => {
    const status = { ...BASE, in_place_upgrade: { ...BASE.in_place_upgrade, evaluations_running: 2 } };
    const { result } = renderHook(() => useInPlaceUpgrade(status, vi.fn()));
    expect(result.current.blocked).toBe(true);
  });

  it('starts the upgrade and adopts the fresh status', async () => {
    const next = { ...BASE, in_place_upgrade: { ...BASE.in_place_upgrade, phase: 'upgrading' } };
    startUpgrade.mockResolvedValue({ ok: true });
    getUpdateStatus.mockResolvedValue(next);
    const adopt = vi.fn();
    const { result } = renderHook(() => useInPlaceUpgrade(BASE, adopt));
    act(() => { result.current.begin(); });
    await waitFor(() => expect(adopt).toHaveBeenCalledWith(next));
  });

  it('re-reads the status instead of failing when an evaluation started meanwhile', async () => {
    startUpgrade.mockRejectedValue(Object.assign(new Error('busy'), { code: 'EVALUATIONS_RUNNING' }));
    getUpdateStatus.mockResolvedValue(BASE);
    const adopt = vi.fn();
    const { result } = renderHook(() => useInPlaceUpgrade(BASE, adopt));
    act(() => { result.current.begin(); });
    await waitFor(() => expect(adopt).toHaveBeenCalled());
    expect(result.current.failed).toBe(false);
  });

  it('marks a refused start as failed', async () => {
    startUpgrade.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useInPlaceUpgrade(BASE, vi.fn()));
    act(() => { result.current.begin(); });
    await waitFor(() => expect(result.current.failed).toBe(true));
  });

  it('restart ignores the dropped connection', async () => {
    restartAfterUpgrade.mockRejectedValue(new Error('network'));
    const status = { ...BASE, in_place_upgrade: { ...BASE.in_place_upgrade, phase: 'installed' } };
    const { result } = renderHook(() => useInPlaceUpgrade(status, vi.fn()));
    expect(result.current.installed).toBe(true);
    act(() => { result.current.restart(); });
    expect(result.current.restarting).toBe(true);
    expect(result.current.failed).toBe(false);
  });
});
