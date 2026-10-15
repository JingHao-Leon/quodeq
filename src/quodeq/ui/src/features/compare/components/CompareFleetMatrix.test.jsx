import { describe, it, expect } from 'vitest';
import { longestHeaderWord } from './CompareFleetMatrix.jsx';

describe('longestHeaderWord', () => {
  it('measures the longest run a header cannot wrap inside', () => {
    expect(longestHeaderWord(['security', 'maintainability'])).toBe(15);
    // A header wraps after a hyphen and at spaces, so those split the runs.
    expect(longestHeaderWord(['clean-architecture'])).toBe(12);
    expect(longestHeaderWord(['Single responsibility'])).toBe(14);
  });

  it('is zero without headers', () => {
    expect(longestHeaderWord([])).toBe(0);
  });
});
