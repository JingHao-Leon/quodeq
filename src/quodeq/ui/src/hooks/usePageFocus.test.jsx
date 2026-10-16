import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageFocus, withPageFocus } from './usePageFocus.js';

describe('usePageFocus', () => {
  it('adds what the mounted pages publish to the ui state sent with a message', () => {
    const { rerender, unmount } = renderHook(({ area }) => usePageFocus('riskArea', area), { initialProps: { area: 'core' } });
    expect(withPageFocus({ page: 'map' })).toEqual({ page: 'map', focus: { riskArea: 'core' } });
    rerender({ area: 'ui' });
    expect(withPageFocus({ page: 'map' }).focus).toEqual({ riskArea: 'ui' });
    unmount();
    expect(withPageFocus({ page: 'map' })).toEqual({ page: 'map' });
  });

  it('leaves out empty values', () => {
    const { unmount } = renderHook(() => usePageFocus('standard', null));
    expect(withPageFocus({ page: 'standards' })).toEqual({ page: 'standards' });
    unmount();
  });
});
