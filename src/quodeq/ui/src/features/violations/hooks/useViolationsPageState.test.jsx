import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useViolationsPageState } from './useViolationsPageState.js';

vi.mock('../components/useDismissedFindings.js', () => ({
  useDismissedFindings: () => ({
    dismissed: [{ id: 'd1' }], loading: false,
    handleRestore: vi.fn(), handleRestoreAll: vi.fn(), handleDelete: vi.fn(), handleDeleteAll: vi.fn(),
  }),
}));
vi.mock('../../../utils/visibleStandards.js', () => ({ readVisibleStandardIds: () => ['security'] }));

const DIMS = [
  { dimension: 'security', violations: [{ file: 'a.py', severity: 'major' }] },
  { dimension: 'perf', violations: [{ file: 'b.py', severity: 'minor' }] },
];

describe('useViolationsPageState', () => {
  it('keeps the visible dimensions and their summary', () => {
    const { result } = renderHook(() => useViolationsPageState({ selectedProject: 'p', accumulatedDimensions: DIMS }));
    expect(result.current.visibleDimensions.map((d) => d.dimension)).toEqual(['security']);
    expect(result.current.summary.totalViolations).toBe(1);
  });

  it('carries the dismissed list and no file-tree state', () => {
    const { result } = renderHook(() => useViolationsPageState({ selectedProject: 'p', accumulatedDimensions: DIMS }));
    expect(result.current.dismissed).toEqual([{ id: 'd1' }]);
    expect(result.current).not.toHaveProperty('fileCurrentPath');
    expect(result.current).not.toHaveProperty('topFilesCount');
  });
});
