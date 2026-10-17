import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GradeChip, heroCardHandlers } from './heroSectionParts.jsx';

describe('GradeChip', () => {
  it('the grade word follows the score on show, not the stored grade', () => {
    const { container } = render(<GradeChip score="8.5" grade="Exemplary" />);
    expect(container.querySelector('.chip')).toHaveTextContent('GOOD');
  });

  it('falls back to the stored grade when the score does not parse', () => {
    const { container } = render(<GradeChip score="—" grade="Adequate" />);
    expect(container.querySelector('.chip')).toHaveTextContent('ADEQUATE');
  });
});

describe('heroCardHandlers', () => {
  it('opens violations and a severity when there are violations', () => {
    const open = vi.fn();
    const some = heroCardHandlers(open, { violations: 3, compliance: 0 });
    some.handleViolations();
    some.handleSeverity('major');
    expect(open.mock.calls).toEqual([['violations'], ['major']]);
  });

  it('opens no compliance without compliant checks', () => {
    expect(heroCardHandlers(vi.fn(), { violations: 3, compliance: 0 }).handleCompliance).toBeUndefined();
  });

  it('opens nothing without a navigator', () => {
    expect(heroCardHandlers(undefined, { violations: 3, compliance: 3 }).handleSeverity).toBeUndefined();
  });
});
