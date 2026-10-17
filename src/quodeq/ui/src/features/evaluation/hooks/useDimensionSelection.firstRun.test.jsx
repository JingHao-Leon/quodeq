import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDimensionSelection } from './useDimensionSelection.js';

/**
 * First-run seeding: a project that was never evaluated starts with every
 * dimension ticked (never a partial default); one with runs starts empty;
 * an explicit preselect from navigation always wins.
 */

const DIMS = [{ id: 'security' }, { id: 'maintainability' }, { id: 'reliability' }];
const INFO = { path: '/repos/demo' };

function renderSelection(initial) {
  return renderHook((props) => useDimensionSelection({ info: INFO, onStart: vi.fn(), ...props }), {
    initialProps: { allDimensions: [], ...initial },
  });
}

describe('useDimensionSelection first run', () => {
  it('first run selects every dimension', () => {
    const { result, rerender } = renderSelection({ isFirstRun: true });
    expect(result.current.selectedDims.size).toBe(0);
    rerender({ allDimensions: DIMS, isFirstRun: true });
    expect([...result.current.selectedDims].sort()).toEqual(['maintainability', 'reliability', 'security']);
  });

  it('a project with runs starts with none selected', () => {
    const { result, rerender } = renderSelection({ isFirstRun: false });
    rerender({ allDimensions: DIMS, isFirstRun: false });
    expect(result.current.selectedDims.size).toBe(0);
  });

  it('an explicit preselect wins over the first-run default', () => {
    const { result, rerender } = renderSelection({ isFirstRun: true, preselectDims: ['Security'] });
    rerender({ allDimensions: DIMS, isFirstRun: true, preselectDims: ['Security'] });
    expect([...result.current.selectedDims]).toEqual(['security']);
  });

  it('seeds once, so clearing after the first-run seed sticks', () => {
    const { result, rerender } = renderSelection({ isFirstRun: true });
    rerender({ allDimensions: DIMS, isFirstRun: true });
    act(() => result.current.clearAll());
    rerender({ allDimensions: [...DIMS], isFirstRun: true });
    expect(result.current.selectedDims.size).toBe(0);
  });
});
