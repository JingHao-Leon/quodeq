import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readWorkbench, useWorkbenchState, WORKBENCH_DEFAULTS } from './useWorkbenchState.js';

describe('readWorkbench', () => {
  it('fills defaults and drops values outside their sets', () => {
    expect(readWorkbench(undefined)).toEqual(WORKBENCH_DEFAULTS);
    const s = readWorkbench({ q: 'api', severity: 'loud', status: 'gone', group: 'folders', paths: ['src/', 3], selectedId: 7 });
    expect(s).toEqual({ ...WORKBENCH_DEFAULTS, q: 'api', group: 'folders', paths: ['src/'] });
  });

  it('keeps each path once', () => {
    expect(readWorkbench({ paths: ['src/', 'src/a.py', 'src/'] }).paths).toEqual(['src/', 'src/a.py']);
  });
});

describe('useWorkbenchState', () => {
  it('writes every change through onChange', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useWorkbenchState({ q: 'x' }, onChange));
    act(() => result.current.set({ severity: 'major' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...WORKBENCH_DEFAULTS, q: 'x', severity: 'major' });
  });

  it('adds a path once and removes it', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ p }) => useWorkbenchState(p, onChange), { initialProps: { p: { paths: ['src/'] } } });
    act(() => result.current.addPath('src/'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ paths: ['src/'] }));
    act(() => result.current.addPath('src/a.py'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ paths: ['src/', 'src/a.py'] }));
    rerender({ p: { paths: ['src/', 'src/a.py'] } });
    act(() => result.current.removePath('src/'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ paths: ['src/a.py'] }));
  });
});

describe('useWorkbenchState: search text and selection write to the nav entry debounced', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const mount = (param = null) => {
    const onChange = vi.fn();
    const hook = renderHook(({ p }) => useWorkbenchState(p, onChange), { initialProps: { p: param } });
    return { onChange, ...hook };
  };

  it('typing five characters shows each at once and writes once', () => {
    const { onChange, result } = mount();
    ['a', 'ab', 'abc', 'abcd', 'abcde'].forEach((q) => act(() => result.current.set({ q })));
    expect(result.current.state.q).toBe('abcde');
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(400); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'abcde' }));
  });

  it('five arrow moves write once', () => {
    const { onChange, result } = mount();
    ['1', '2', '3', '4', '5'].forEach((selectedId) => act(() => result.current.set({ selectedId })));
    act(() => { vi.advanceTimersByTime(400); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ selectedId: '5' }));
  });

  it('a filter change writes at once, the pending search text with it', () => {
    const { onChange, result } = mount();
    act(() => result.current.set({ q: 'ke' }));
    act(() => result.current.set({ severity: 'major' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ke', severity: 'major' }));
    act(() => { vi.advanceTimersByTime(400); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('unmount flushes the pending write', () => {
    const { onChange, result, unmount } = mount();
    act(() => result.current.set({ q: 'key' }));
    unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'key' }));
  });

  it('a param from outside (back, forward) replaces the local state; its own echo does not', () => {
    const { onChange, result, rerender } = mount({ q: 'old' });
    act(() => result.current.set({ severity: 'major' }));
    rerender({ p: onChange.mock.calls[0][0] });
    expect(result.current.state).toEqual(expect.objectContaining({ q: 'old', severity: 'major' }));
    rerender({ p: { q: 'back' } });
    expect(result.current.state).toEqual(expect.objectContaining({ q: 'back', severity: null }));
  });
});
