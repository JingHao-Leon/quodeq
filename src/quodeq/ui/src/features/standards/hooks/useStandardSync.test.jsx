import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { useStandardSync } from './useStandardSync.js';

vi.mock('../../../utils/confirmDialog.js', () => ({ confirmDialog: vi.fn() }));
import { confirmDialog } from '../../../utils/confirmDialog.js';

const A = { id: 'a', name: 'Android' };
const B = { id: 'b', name: 'Go' };

function setup(overrides = {}, refreshImpl = vi.fn()) {
  const api = {
    shareStandard: vi.fn().mockResolvedValue({ id: 'a' }),
    installStandard: vi.fn().mockResolvedValue({ id: 'a' }),
    updateStandardFromShared: vi.fn().mockResolvedValue({ id: 'a' }),
    ...overrides,
  };
  const refresh = refreshImpl;
  const wrapper = ({ children }) => <ApiProvider value={api}>{children}</ApiProvider>;
  const { result, rerender } = renderHook(({ list }) => useStandardSync({ refresh, list }), { wrapper, initialProps: { list: 'l1' } });
  return { api, refresh, result, rerender };
}

describe('useStandardSync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('share calls the API without force and refreshes', async () => {
    const { api, refresh, result } = setup();
    await act(() => result.current.run(A, { action: 'share', force: false }));
    expect(api.shareStandard).toHaveBeenCalledWith('a', { force: false });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('diverged publish asks to confirm and sends force', async () => {
    confirmDialog.mockResolvedValue(true);
    const { api, result } = setup();
    await act(() => result.current.run(A, { action: 'publish', force: true }));
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(api.shareStandard).toHaveBeenCalledWith('a', { force: true });
  });

  it('cancelled confirm sends nothing', async () => {
    confirmDialog.mockResolvedValue(false);
    const { api, refresh, result } = setup();
    await act(() => result.current.run(A, { action: 'update', force: true }));
    expect(api.updateStandardFromShared).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a second run while pending does nothing', async () => {
    let resolve;
    const pending = new Promise((r) => { resolve = r; });
    const { api, result } = setup({ shareStandard: vi.fn().mockReturnValue(pending) });
    let first;
    act(() => { first = result.current.run(A, { action: 'share', force: false }); });
    await act(() => result.current.run(A, { action: 'share', force: false }));
    expect(api.shareStandard).toHaveBeenCalledTimes(1);
    expect(result.current.pendingId).toBe('a');
    await act(async () => { resolve({ id: 'a' }); await first; });
    expect(result.current.pendingId).toBeNull();
  });

  it('a conflict shows the server message under that row only', async () => {
    const message = 'The shared copy of a changed since you last pulled.';
    // request() puts the envelope's `error` sentence on err.message.
    const err = Object.assign(new Error(message), { status: 409, code: 'conflict', body: { error: message } });
    const { result } = setup({ shareStandard: vi.fn().mockRejectedValue(err) });
    await act(() => result.current.run(A, { action: 'share', force: false }));
    expect(result.current.errors.a).toBe(message);
    expect(result.current.errors.b).toBeUndefined();
  });

  it('install and update map to their clients', async () => {
    const { api, result } = setup();
    await act(() => result.current.run(B, { action: 'install', force: false }));
    await act(() => result.current.run(A, { action: 'update', force: false }));
    expect(api.installStandard).toHaveBeenCalledWith('b');
    expect(api.updateStandardFromShared).toHaveBeenCalledWith('a', { force: false });
  });

  it('stays pending until the re-list resolves, so the old button cannot be clicked twice', async () => {
    let release;
    const refresh = vi.fn(() => new Promise((r) => { release = r; }));
    const { api, result } = setup({}, refresh);
    let first;
    act(() => { first = result.current.run(A, { action: 'share', force: false }); });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(result.current.pendingId).toBe('a');
    await act(() => result.current.run(A, { action: 'share', force: false }));
    expect(api.shareStandard).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await first; });
    expect(result.current.pendingId).toBeNull();
  });

  it('a failed re-list is not reported as a failed sync', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup({}, vi.fn().mockRejectedValue(new Error('offline')));
    await act(() => result.current.run(A, { action: 'share', force: false }));
    expect(result.current.errors.a).toBeUndefined();
    expect(result.current.pendingId).toBeNull();
  });

  it('row errors are cleared when the list changes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result, rerender } = setup({ shareStandard: vi.fn().mockRejectedValue(new Error('nope')) });
    await act(() => result.current.run(A, { action: 'share', force: false }));
    expect(result.current.errors.a).toBe('nope');
    rerender({ list: 'l1' });
    expect(result.current.errors.a).toBe('nope');
    rerender({ list: 'l2' });
    expect(result.current.errors.a).toBeUndefined();
  });
});
