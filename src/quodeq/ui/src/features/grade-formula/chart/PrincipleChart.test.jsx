import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PrincipleChart from './PrincipleChart.jsx';

const SAVED = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};
// chartScale's left margin and the floor label's inset from it.
const PLOT_LEFT = 44;
const FLOOR_LABEL_INSET = 6;
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

  it('puts the floor labels at the left of the plot, clear of the band labels', () => {
    const { container } = mount();
    const labels = [...container.querySelectorAll('.gf-floor__label')];
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      expect(label).toHaveAttribute('x', String(PLOT_LEFT + FLOOR_LABEL_INSET));
      expect(label).toHaveAttribute('text-anchor', 'start');
    }
  });

  it('sets each dot\'s cy attribute beside the animated CSS property', () => {
    const { container } = mount();
    expect(container.querySelector('.gf-dot').getAttribute('cy')).toMatch(/^\d+(\.\d+)?$/);
  });

  it('counts a single principle in the singular', () => {
    mount({ inputs: { projects: [INPUTS.projects[0]] } });
    expect(screen.getByText('1 principle · none move yet')).toBeInTheDocument();
  });

  it('counts a single moving principle in the singular', () => {
    mount({ inputs: { projects: [INPUTS.projects[1]] }, draft: { ...SAVED, severityWeight: { critical: 6, major: 5, minor: 0.25 } } });
    expect(screen.getByText(/^1 principle · 1 move · \d change grade$/)).toBeInTheDocument();
  });

  it('draws only the bands while the projects load, nothing the x range moves', () => {
    const { container } = mount({ inputs: null, loading: true });
    expect(container.querySelectorAll('.gf-band')).toHaveLength(5);
    expect(container.querySelector('.gf-curve')).not.toBeInTheDocument();
    expect(container.querySelector('.gf-tick--x')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.gf-dot')).toHaveLength(0);
    expect(screen.getByText('Reading your projects…')).toBeInTheDocument();
  });

  it('drops the loading line when the projects fail to load', () => {
    mount({ inputs: null, loading: false });
    expect(screen.queryByText('Reading your projects…')).not.toBeInTheDocument();
  });

  it('anchors the axis text so ticks and titles sit on their positions', () => {
    const { container } = mount();
    const anchor = (sel) => container.querySelector(sel).getAttribute('text-anchor');
    expect(anchor('.gf-tick--y')).toBe('end');
    expect(container.querySelector('.gf-tick--y').getAttribute('dominant-baseline')).toBe('middle');
    expect(anchor('.gf-tick--x')).toBe('middle');
    const titles = container.querySelectorAll('.gf-axis-title');
    expect([...titles].map((n) => n.getAttribute('text-anchor'))).toEqual(['middle', 'middle']);
  });
});

describe('PrincipleChart text scale', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sets viewBox units per pixel from the rendered width, capped for narrow screens', () => {
    let report;
    vi.stubGlobal('ResizeObserver', class { constructor(cb) { report = cb; } observe() {} disconnect() {} });
    const { container } = mount();
    const figure = container.querySelector('figure');
    act(() => report([{ contentRect: { width: 480 } }]));
    expect(figure.style.getPropertyValue('--gf-k')).toBe('2');
    act(() => report([{ contentRect: { width: 200 } }]));
    expect(figure.style.getPropertyValue('--gf-k')).toBe('2.6');
  });
});
