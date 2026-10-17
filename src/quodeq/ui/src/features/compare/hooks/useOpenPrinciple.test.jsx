import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOpenPrinciple } from './useOpenPrinciple.js';

describe('useOpenPrinciple', () => {
  it('hands the target\'s source to the principle opener', () => {
    const onOpenProjectPrinciple = vi.fn();
    const { result } = renderHook(() => useOpenPrinciple({ onOpenProjectPrinciple, openProject: vi.fn() }));
    result.current({ id: 'p1', source: 'shared', dimName: 'Security', principle: 'Integrity' });
    expect(onOpenProjectPrinciple).toHaveBeenCalledWith({ id: 'p1', source: 'shared', dimName: 'Security', principle: 'Integrity' });
  });
});
