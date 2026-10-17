import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import KnobGroups from './KnobGroups.jsx';

const SAVED = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};
const INPUTS = { projects: [{ id: 'a', dimensions: [{ dimension: 'security', frozenScore: null, principles: [
  { id: 'p', massMinor: 1, massMajor: 2, massCritical: 0, complianceMass: 3, observation: 1, worst: 'major' }] }] }] };

function mount(over = {}) {
  const props = { draft: SAVED, saved: SAVED, defaults: SAVED, inputs: INPUTS, update: vi.fn(), onHoverGroup: vi.fn(), ...over };
  render(<KnobGroups {...props} />);
  return props;
}

describe('KnobGroups', () => {
  it('shows the open groups and keeps fine-tune folded at the defaults', () => {
    mount();
    expect(screen.getByText('What a finding costs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fine-tune' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('How fast scores fall')).toBeNull();
  });

  it('opens fine-tune by itself when a knob inside is off its default', () => {
    mount({ draft: { ...SAVED, baseK: 0.1 } });
    expect(screen.getByRole('button', { name: 'Fine-tune' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('How fast scores fall')).toBeInTheDocument();
  });

  it('sends a knob move as a draft patch', () => {
    const props = mount();
    fireEvent.change(screen.getByLabelText('major'), { target: { value: '3' } });
    expect(props.update).toHaveBeenCalledWith({ severityWeight: { critical: 4, major: 3, minor: 0.25 } });
  });

  it('strikes the saved value through when the draft moved it, and says what the group reaches', () => {
    mount({ draft: { ...SAVED, severityWeight: { critical: 4, major: 3, minor: 0.25 } } });
    expect(screen.getByText('2', { selector: 's' })).toBeInTheDocument();
    expect(screen.getByText('moves 1 of 1 principles')).toBeInTheDocument();
  });

  it('reports the hovered group', () => {
    const props = mount();
    fireEvent.mouseEnter(screen.getByText('What a finding costs').closest('section'));
    expect(props.onHoverGroup).toHaveBeenCalledWith('cost');
  });

  it('marks a group as reaching only when it moves a principle', () => {
    mount({ draft: { ...SAVED, severityWeight: { critical: 4, major: 3, minor: 0.25 } } });
    expect(screen.getByRole('region', { name: 'What a finding costs' })).toHaveClass('gf-group--reaching');
    expect(screen.getByRole('region', { name: 'Where each grade starts' })).not.toHaveClass('gf-group--reaching');
  });
});

describe('KnobGroups hint line', () => {
  const QUESTION = 'How much each open rule weighs, by its severity.';
  const MAJOR_HINT = 'weight of a major rule; the knob that moves grades most';

  it('swaps the group question for the hint of the knob under the pointer', () => {
    mount();
    fireEvent.mouseEnter(screen.getByLabelText('major').closest('.gf-knob'));
    expect(screen.getByText(MAJOR_HINT)).toHaveClass('gf-group__question--hint');
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it('puts the question back when the pointer leaves the group', () => {
    mount();
    fireEvent.mouseEnter(screen.getByLabelText('major').closest('.gf-knob'));
    fireEvent.mouseLeave(screen.getByText('What a finding costs').closest('section'));
    expect(screen.getByText(QUESTION)).not.toHaveClass('gf-group__question--hint');
  });

  it('shows the hint for a knob reached by keyboard', () => {
    mount();
    fireEvent.focus(screen.getByLabelText('major'));
    expect(screen.getByText(MAJOR_HINT)).toBeInTheDocument();
  });
});
