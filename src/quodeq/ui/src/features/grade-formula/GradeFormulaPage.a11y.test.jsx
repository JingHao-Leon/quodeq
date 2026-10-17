/**
 * #6033 - the FORMULA/TYPES/DIMENSIONS tab strip had no ARIA
 * tab semantics: no role="tablist"/"tab", no aria-selected, no
 * role="tabpanel" on the body it controls. The review sheet is a named
 * modal dialog, and every knob slider carries a name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../api/ApiContext.jsx';
import useGradeFormula from './useGradeFormula.js';
import { useFormulaInputs } from './hooks/useFormulaInputs.js';
import GradeFormulaPage from './GradeFormulaPage.jsx';
import { SERVER_RANGES } from './knobs/_serverRanges.fixtures.js';

vi.mock('./useGradeFormula.js', () => ({ default: vi.fn() }));
vi.mock('./hooks/useFormulaInputs.js', () => ({ useFormulaInputs: vi.fn() }));
vi.mock('../../api/index.js', async (importOriginal) => ({
  ...(await importOriginal()), previewGradeFormula: vi.fn(() => new Promise(() => {})),
}));

const FORMULA = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};

function Providers({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><ApiProvider value={{}}>{children}</ApiProvider></QueryClientProvider>;
}

function mount() {
  return render(<GradeFormulaPage navigation={{ selectedProject: null, projects: [] }} />, { wrapper: Providers });
}

describe('GradeFormulaPage a11y', () => {
  beforeEach(() => {
    useGradeFormula.mockReturnValue({
      saved: FORMULA, draft: FORMULA, defaults: FORMULA, ranges: SERVER_RANGES, isCustom: true, isDirty: false, busy: false, error: null,
      partialNotice: null, rescoreProgress: null, update: vi.fn(), apply: vi.fn(), resetToDefaults: vi.fn(),
    });
    useFormulaInputs.mockReturnValue({ inputs: { projects: [] }, loading: false, failed: false });
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('exposes the tab strip as a labelled tablist', () => {
    mount();
    expect(screen.getByRole('tablist', { name: 'Grade formula view' })).toBeInTheDocument();
  });

  it('marks the active tab as selected and switches selection on click', () => {
    mount();
    expect(screen.getAllByRole('tab').map((el) => el.textContent)).toEqual(['FORMULA', 'TYPES', 'DIMENSIONS']);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('FORMULA');
    fireEvent.click(screen.getByRole('tab', { name: 'DIMENSIONS' }));
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('DIMENSIONS');
  });

  it('renders the active tab body as a tabpanel', () => {
    mount();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  // #6033 - complete the tab pattern: each tab points at the
  // panel it controls, and the panel is labelled by whichever tab is active.
  it('wires aria-controls from the active tab to the panel, and aria-labelledby back', () => {
    mount();
    const tab = screen.getByRole('tab', { selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('updates aria-controls/aria-labelledby when the active tab changes', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'DIMENSIONS' }));
    const tab = screen.getByRole('tab', { selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveTextContent('DIMENSIONS');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('the review sheet is a named modal dialog', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'RESET Q²' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset to Q² defaults' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('every slider has an accessible name', () => {
    mount();
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThan(0);
    for (const slider of sliders) expect(slider).toHaveAccessibleName();
  });
});
