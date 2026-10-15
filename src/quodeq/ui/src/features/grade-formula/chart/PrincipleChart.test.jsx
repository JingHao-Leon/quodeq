import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PrincipleChart from './PrincipleChart.jsx';

const SAVED = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};
const P = (id, major) => ({ id, massMinor: 1, massMajor: major, massCritical: 0, complianceMass: 3, observation: 1, worst: 'major' });
const INPUTS = { projects: [
  { id: 'a', dimensions: [{ dimension: 'security', frozenScore: null, principles: [P('p1', 0.5)] }] },
  { id: 'b', dimensions: [{ dimension: 'security', frozenScore: null, principles: [P('p2', 3)] }] },
] };

function mount(over = {}) {
  const props = { inputs: INPUTS, saved: SAVED, draft: SAVED, highlight: null, litProject: null, onHoverProject: vi.fn(), ...over };
  const view = render(<PrincipleChart {...props} />);
  return { ...view, props };
}

describe('PrincipleChart', () => {
  it('draws a dot per principle and summarises at rest', () => {
    const { container } = mount();
    expect(container.querySelectorAll('.gf-dot')).toHaveLength(2);
    expect(screen.getByText('2 principles · none move yet')).toBeInTheDocument();
  });

  it('colours the dots that move and counts the grade changes', () => {
    const { container } = mount({ draft: { ...SAVED, severityWeight: { critical: 6, major: 5, minor: 0.25 } } });
    expect(container.querySelectorAll('.gf-dot--down').length).toBeGreaterThan(0);
    expect(screen.getByText(/2 principles · \d move · \d change grade/)).toBeInTheDocument();
  });

  it('dims the other projects when one is lit and reports the hovered dot', () => {
    const { container, props } = mount({ litProject: 'a' });
    expect(container.querySelectorAll('.gf-dot--dim')).toHaveLength(1);
    fireEvent.mouseEnter(container.querySelector('.gf-dot-hit'));
    expect(props.onHoverProject).toHaveBeenCalled();
  });

  it('marks the part a hovered knob group moves', () => {
    const { container } = mount({ highlight: 'steep' });
    expect(container.querySelector('svg')).toHaveClass('gf-chart--hl-steep');
  });
});
