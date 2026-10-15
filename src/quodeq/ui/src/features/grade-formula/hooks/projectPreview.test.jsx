import { describe, it, expect } from 'vitest';
import { projectPreview } from './useGradePreview.js';

const SIDE = { overall: { score: 7.3, grade: 'Good' }, dimensions: [] };

describe('projectPreview', () => {
  it('returns the selected project before/after', () => {
    const payload = { projects: [{ id: 'a', before: SIDE, after: SIDE }, { id: 'b', before: SIDE, after: { ...SIDE } }], runsToRescore: 3 };
    expect(projectPreview(payload, 'b')).toEqual({ before: SIDE, after: SIDE });
  });

  it('is null when the selected project is not in the preview', () => {
    expect(projectPreview({ projects: [{ id: 'a', before: SIDE, after: SIDE }], runsToRescore: 1 }, 'shared-x')).toBeNull();
  });

  it('is null for a missing payload', () => {
    expect(projectPreview(null, 'a')).toBeNull();
  });
});
