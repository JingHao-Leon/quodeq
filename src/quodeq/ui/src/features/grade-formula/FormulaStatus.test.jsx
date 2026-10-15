import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FormulaStatus from './FormulaStatus.jsx';

describe('FormulaStatus', () => {
  it('shows a plain rescoring message before the pass has counted its runs', () => {
    render(<FormulaStatus error={null} partialNotice={null} rescoreProgress={{ done: 0, total: 0 }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Rescoring…$/);
  });

  it('keeps the rescore live region mounted and empty when no pass runs', () => {
    render(<FormulaStatus error={null} partialNotice={null} rescoreProgress={null} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('counts the runs once the pass has listed them', () => {
    render(<FormulaStatus error={null} partialNotice={null} rescoreProgress={{ done: 2, total: 5 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rescoring 2 of 5 runs');
  });
});
