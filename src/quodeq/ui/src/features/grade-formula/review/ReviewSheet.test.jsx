import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../api/index.js', () => ({ previewGradeFormula: vi.fn() }));

import { previewGradeFormula } from '../../../api/index.js';
import ReviewSheet from './ReviewSheet.jsx';

const SAVED = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};
const TARGET = { ...SAVED, severityWeight: { critical: 4, major: 3, minor: 0.25 } };
const PAYLOAD = { projects: [{ id: 'a', before: { overall: { score: 7.3, grade: 'Good' } }, after: { overall: { score: 6.5, grade: 'Adequate' } } }], runsToRescore: 293 };

function mount(over = {}) {
  const props = { mode: 'apply', target: TARGET, saved: SAVED, inputs: { projects: [] }, names: { a: 'Alpha' },
    busy: false, onConfirm: vi.fn(), onCancel: vi.fn(), ...over };
  render(<ReviewSheet {...props} />);
  return props;
}

beforeEach(() => { previewGradeFormula.mockReset(); });

describe('ReviewSheet', () => {
  it('lists the changed settings and, from the server, the flips and runs', async () => {
    previewGradeFormula.mockResolvedValue(PAYLOAD);
    mount();
    expect(screen.getByRole('dialog', { name: 'Review changes before applying' })).toBeInTheDocument();
    expect(screen.getByText('major')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Apply to 293 runs' })).toBeEnabled();
    expect(previewGradeFormula).toHaveBeenCalledWith(TARGET);
  });

  it('shows the failure and keeps Apply', async () => {
    previewGradeFormula.mockRejectedValue(new Error('down'));
    const props = mount();
    await waitFor(() => expect(screen.getByText(/Could not score the projects/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Apply/ }));
    expect(props.onConfirm).toHaveBeenCalled();
  });

  it('closes on Escape and on Keep editing', () => {
    previewGradeFormula.mockReturnValue(new Promise(() => {}));
    const props = mount();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(props.onCancel).toHaveBeenCalledTimes(2);
  });

  it('titles a reset as one', () => {
    previewGradeFormula.mockReturnValue(new Promise(() => {}));
    mount({ mode: 'reset', target: SAVED, saved: TARGET });
    expect(screen.getByRole('dialog', { name: 'Reset to Q² defaults' })).toBeInTheDocument();
  });
});
