import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWhereView } from './useWhereView.js';
import { WHERE, WHERE_VIEWS } from './WherePanel.jsx';

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useWhereView', () => {
  it('starts on the given view', () => {
    const { result } = renderHook(() => useWhereView('overview', WHERE.AREAS, WHERE_VIEWS));
    expect(result.current[0]).toBe(WHERE.AREAS);
  });

  it('remembers the chosen view for the session, per page', () => {
    const first = renderHook(() => useWhereView('overview', WHERE.AREAS, WHERE_VIEWS));
    act(() => { first.result.current[1](WHERE.FILES); });
    first.unmount();
    expect(renderHook(() => useWhereView('overview', WHERE.AREAS, WHERE_VIEWS)).result.current[0]).toBe(WHERE.FILES);
    expect(renderHook(() => useWhereView('dimension', WHERE.AREAS, WHERE_VIEWS)).result.current[0]).toBe(WHERE.AREAS);
  });

  it('ignores a remembered view this page does not offer', () => {
    sessionStorage.setItem('quodeq.where.run', WHERE.AREAS);
    const { result } = renderHook(() => useWhereView('run', WHERE.FOLDERS, [WHERE.FOLDERS, WHERE.FILES]));
    expect(result.current[0]).toBe(WHERE.FOLDERS);
  });

  it('still switches when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useWhereView('overview', WHERE.AREAS, WHERE_VIEWS));
    act(() => { result.current[1](WHERE.FOLDERS); });
    expect(result.current[0]).toBe(WHERE.FOLDERS);
  });
});
