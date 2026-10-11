import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistorySelection } from './useHistorySelection.js';

const rows = [{ runId: 'a' }, { runId: 'b' }];
const three = [{ runId: 'a' }, { runId: 'b' }, { runId: 'c' }];

describe('useHistorySelection', () => {
  it('starts on the remembered run and reports changes to the app', () => {
    const onRunChange = vi.fn();
    const { result } = renderHook(() => useHistorySelection({ initialRunId: 'b', onRunChange, rows }));
    expect(result.current.selected.runId).toBe('b');
    act(() => result.current.select('a'));
    expect(onRunChange).toHaveBeenCalledWith('a');
  });

  it('falls back to the first row when the remembered run is filtered out or deleted', () => {
    const { result } = renderHook(() => useHistorySelection({ initialRunId: 'gone', onRunChange: vi.fn(), rows }));
    expect(result.current.selected.runId).toBe('a');
  });

  it('keeps the tab across remounts', () => {
    const first = renderHook(() => useHistorySelection({ initialRunId: 'a', onRunChange: vi.fn(), rows }));
    act(() => first.result.current.setTab('new'));
    first.unmount();
    const second = renderHook(() => useHistorySelection({ initialRunId: 'a', onRunChange: vi.fn(), rows }));
    expect(second.result.current.tab).toBe('new');
  });

  it('still works when sessionStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useHistorySelection({ initialRunId: 'a', onRunChange: vi.fn(), rows }));
    expect(result.current.tab).toBe('dimensions');
    spy.mockRestore();
  });

  it('moves to the row now at the same index when the selected run is deleted, and reports it', () => {
    const onRunChange = vi.fn();
    const { result, rerender } = renderHook(({ r }) => useHistorySelection({ initialRunId: 'b', onRunChange, rows: r }), { initialProps: { r: three } });
    rerender({ r: [three[0], three[2]] });
    expect(result.current.selected.runId).toBe('c');
    expect(onRunChange).toHaveBeenCalledWith('c');
  });

  it('does not jump back when a filter is cleared', () => {
    const { result, rerender } = renderHook(({ r }) => useHistorySelection({ initialRunId: 'c', onRunChange: vi.fn(), rows: r }), { initialProps: { r: three } });
    rerender({ r: [three[0]] });
    expect(result.current.selected.runId).toBe('a');
    rerender({ r: three });
    expect(result.current.selected.runId).toBe('a');
  });

  it('has no selection for empty rows and does not report one', () => {
    const onRunChange = vi.fn();
    const { result } = renderHook(() => useHistorySelection({ initialRunId: 'a', onRunChange, rows: [] }));
    expect(result.current.selected).toBeNull();
    expect(onRunChange).not.toHaveBeenCalled();
  });
});
