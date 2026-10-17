import { describe, it, expect, vi, afterEach } from 'vitest';
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
    onUndo: vi.fn(), onReset: vi.fn(), onRetry: vi.fn(), busy: false, isCustom: true, ...over,
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

  it('offers a retry when the inputs could not be read', () => {
    const props = mount({ inputs: null, failed: true });
    expect(screen.getByText(/Could not read your projects/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('says there is nothing to score yet without a retry', () => {
    mount({ inputs: { projects: [] } });
    expect(screen.getByText(/No finished evaluation yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('disables RESET Q² while the defaults are already in force and nothing is edited', () => {
    mount({ isCustom: false, isDirty: false });
    expect(screen.getByRole('button', { name: 'RESET Q²' })).toBeDisabled();
  });

  it('allows RESET Q² from an edited draft', () => {
    mount({ isCustom: false, isDirty: true, draft: DRAFT });
    expect(screen.getByRole('button', { name: 'RESET Q²' })).toBeEnabled();
  });
});

describe('ImpactPanel stacked layout', () => {
  function stackedScreen(isStacked) {
    vi.stubGlobal('matchMedia', (query) => ({ matches: isStacked, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  }
  afterEach(() => vi.unstubAllGlobals());

  it('folds to a one-line summary that opens on click', () => {
    stackedScreen(true);
    mount();
    const head = screen.getByRole('button', { name: /What changes/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(head).toHaveTextContent('1 project · none change');
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(head.closest('aside')).not.toHaveClass('gf-impact--folded');
  });

  it('counts the projects the draft moves in the summary', () => {
    stackedScreen(true);
    mount({ draft: { ...SAVED, ceilScale: 2 }, isDirty: true, inputs: { projects: [{ id: 'a', dimensions: [{ dimension: 'security', frozenScore: null,
      principles: [{ id: 'p', massMinor: 4, massMajor: 0, massCritical: 0, complianceMass: 1, observation: 1, worst: 'minor' }] }] }] } });
    expect(screen.getByRole('button', { name: /What changes/ })).toHaveTextContent('1 project · 1 change');
  });

  it('is a plain heading, never folded, side by side', () => {
    stackedScreen(false);
    mount();
    expect(screen.queryByRole('button', { name: /What changes/ })).toBeNull();
    expect(screen.getByText('What changes').closest('aside')).not.toHaveClass('gf-impact--folded');
  });
});
