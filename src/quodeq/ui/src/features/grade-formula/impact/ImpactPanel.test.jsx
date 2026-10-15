import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ImpactPanel from './ImpactPanel.jsx';

const SAVED = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};
const DRAFT = { ...SAVED, gradeThresholds: [[9, 'Exemplary'], [8.5, 'Good'], [5, 'Adequate'], [3, 'Poor']] };
const INPUTS = { projects: [{ id: 'a', dimensions: [{ dimension: 'security', frozenScore: 8.1, principles: [] }] }] };

function mount(over = {}) {
  const props = {
    inputs: INPUTS, loading: false, failed: false, names: { a: 'Alpha' }, saved: SAVED, draft: SAVED,
    isDirty: false, changedCount: 0, litProject: null, onLitProject: vi.fn(), onReview: vi.fn(),
    onUndo: vi.fn(), onReset: vi.fn(), busy: false, ...over,
  };
  render(<ImpactPanel {...props} />);
  return props;
}

describe('ImpactPanel', () => {
  it('lists every project and says nothing changed at rest', () => {
    mount();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Nothing changed yet. Move a knob to see what it does to your grades.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review and apply' })).toBeDisabled();
  });

  it('shows a grade flip and counts it in the headline', () => {
    mount({ draft: DRAFT, isDirty: true, changedCount: 1 });
    expect(screen.getByText('Good → Adequate')).toBeInTheDocument();
    expect(screen.getByText(/Projects that change grade: 1 of 1\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review and apply' })).toBeEnabled();
    expect(screen.getByText('1 setting changed')).toBeInTheDocument();
  });

  it('lights the project under the pointer and opens its dimensions', () => {
    const props = mount();
    const row = screen.getByRole('button', { name: /Alpha/ });
    fireEvent.mouseEnter(row);
    expect(props.onLitProject).toHaveBeenCalledWith('a');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('security')).toBeInTheDocument();
  });

  it('says it is reading while the inputs load, and keeps the actions', () => {
    mount({ inputs: null, loading: true });
    expect(screen.getByText('Reading your projects…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RESET Q²' })).toBeInTheDocument();
  });
});
