import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readWorkbench, useWorkbenchState, WORKBENCH_DEFAULTS } from './useWorkbenchState.js';

describe('readWorkbench', () => {
  it('fills defaults and drops values outside their sets', () => {
    expect(readWorkbench(undefined)).toEqual(WORKBENCH_DEFAULTS);
    const s = readWorkbench({ q: 'api', severity: 'loud', status: 'gone', group: 'folders', paths: ['src/', 3], selectedId: 7 });
    expect(s).toEqual({ ...WORKBENCH_DEFAULTS, q: 'api', group: 'folders', paths: ['src/'] });
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
