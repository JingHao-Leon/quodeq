import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettledValue } from './useSettledValue.js';

afterEach(() => vi.useRealTimers());

describe('useSettledValue', () => {
  it('gives the first value at once', () => {
    const { result } = renderHook(() => useSettledValue('a', 500));
    expect(result.current).toBe('a');
  });

  it('gives only the last of a burst, once it has been quiet for the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useSettledValue(v, 500), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    act(() => { vi.advanceTimersByTime(300); });
    rerender({ v: 'c' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe('c');
  });
});
