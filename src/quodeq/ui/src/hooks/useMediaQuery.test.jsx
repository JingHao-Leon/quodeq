import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery.js';

function fakeList(initial) {
  const listeners = new Set();
  const list = {
    matches: initial,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
    flip(next) { list.matches = next; listeners.forEach((fn) => fn()); },
    listeners,
  };
  return list;
}

describe('useMediaQuery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts from the current match and follows changes', () => {
    const list = fakeList(true);
    vi.stubGlobal('matchMedia', () => list);
    const { result } = renderHook(() => useMediaQuery('(max-width: 960px)'));
    expect(result.current).toBe(true);
    act(() => list.flip(false));
    expect(result.current).toBe(false);
  });

  it('stops listening on unmount', () => {
    const list = fakeList(false);
    vi.stubGlobal('matchMedia', () => list);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 960px)'));
    unmount();
    expect(list.listeners.size).toBe(0);
  });

  it('is false where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery('(max-width: 960px)'));
    expect(result.current).toBe(false);
  });
});
