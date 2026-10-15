import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStandardsPageActions } from './StandardsPage.jsx';
import { ASSISTANT_ACTION_APPLIED_EVENT } from '../../constants.js';

// handleDeleteWithCleanup used to remove a standard's visibility optimistically
// and await the delete with no way to react to a failure -- a failed delete
// left the standard hidden even though it still existed. It must now restore
// the optimistic removal and log instead.
describe('useStandardsPageActions handleDeleteWithCleanup', () => {
  it('restores visibility and logs when the delete fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refresh = vi.fn();
    const handleDelete = vi.fn(async () => false); // makeHandleDelete's failure return
    const addVisible = vi.fn();
    const removeVisible = vi.fn();

    const { result } = renderHook(() => useStandardsPageActions(refresh, handleDelete, addVisible, removeVisible));

    await act(async () => {
      await result.current.handleDeleteWithCleanup('std-1');
    });

    expect(removeVisible).toHaveBeenCalledWith('std-1');
    expect(handleDelete).toHaveBeenCalledWith('std-1');
    expect(addVisible).toHaveBeenCalledWith('std-1');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[StandardsPage]'),
      'std-1',
    );
  });

  it('does not restore visibility when the delete succeeds', async () => {
    const refresh = vi.fn();
    const handleDelete = vi.fn(async () => true);
    const addVisible = vi.fn();
    const removeVisible = vi.fn();

    const { result } = renderHook(() => useStandardsPageActions(refresh, handleDelete, addVisible, removeVisible));

    await act(async () => {
      await result.current.handleDeleteWithCleanup('std-1');
    });

    expect(removeVisible).toHaveBeenCalledWith('std-1');
    expect(addVisible).not.toHaveBeenCalled();
  });
});

describe('useStandardsPageActions assistant-created standard', () => {
  const applied = (detail) => act(() => {
    window.dispatchEvent(new CustomEvent(ASSISTANT_ACTION_APPLIED_EVENT, { detail }));
  });

  it('makes the new standard visible and opens it from the list', () => {
    const addVisible = vi.fn();
    const { result } = renderHook(() => useStandardsPageActions(vi.fn(), vi.fn(), addVisible, vi.fn()));
    applied({ actionType: 'create_standard', standardId: 'android-bp' });
    expect(addVisible).toHaveBeenCalledWith('android-bp');
    expect(result.current.view).toEqual({ mode: 'edit', standardId: 'android-bp' });
  });

  it('leaves an open editor in place and ignores other actions', () => {
    const addVisible = vi.fn();
    const { result } = renderHook(() => useStandardsPageActions(vi.fn(), vi.fn(), addVisible, vi.fn()));
    act(() => { result.current.handleEdit('mine'); });
    applied({ actionType: 'dismiss_finding' });
    applied({ actionType: 'create_standard', standardId: 'android-bp' });
    expect(addVisible).toHaveBeenCalledTimes(1);
    expect(result.current.view).toEqual({ mode: 'edit', standardId: 'mine' });
  });
});
