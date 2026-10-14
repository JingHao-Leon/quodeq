import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrolledPast } from './useScrolledPast.js';

/** An IntersectionObserver stand-in that lets the test report the entry. */
function mockObserver() {
  const state = { report: null, disconnect: vi.fn() };
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb) { state.report = (entry) => cb([entry]); }
    observe() {}
    disconnect() { state.disconnect(); }
  });
  return state;
}

const ref = () => ({ current: document.createElement('section') });

describe('useScrolledPast', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is true once the element leaves the view above, not below', () => {
    const io = mockObserver();
    const { result } = renderHook((r) => useScrolledPast(r), { initialProps: ref() });
    expect(result.current).toBe(false);
    act(() => io.report({ isIntersecting: false, boundingClientRect: { top: -40 } }));
    expect(result.current).toBe(true);
    act(() => io.report({ isIntersecting: true, boundingClientRect: { top: 10 } }));
    expect(result.current).toBe(false);
    act(() => io.report({ isIntersecting: false, boundingClientRect: { top: 900 } }));
    expect(result.current).toBe(false);
  });

  it('stops observing when it unmounts', () => {
    const io = mockObserver();
    const { unmount } = renderHook((r) => useScrolledPast(r), { initialProps: ref() });
    unmount();
    expect(io.disconnect).toHaveBeenCalled();
  });

  it('stays false where IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook((r) => useScrolledPast(r), { initialProps: ref() });
    expect(result.current).toBe(false);
  });
});
