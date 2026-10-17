import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import GradeBoundaryBar from './GradeBoundaryBar.jsx';

// thresholds descending: [[9,'Exemplary'],[7,'Good'],[5,'Adequate'],[3,'Poor']]
// ascending boundaries: [3, 5, 7, 9]
const THRESHOLDS = [
  [9, 'Exemplary'],
  [7, 'Good'],
  [5, 'Adequate'],
  [3, 'Poor'],
];

describe('GradeBoundaryBar slider keyboard accessibility (#1583)', () => {
  it('all dividers have tabIndex=0', () => {
    render(<GradeBoundaryBar thresholds={THRESHOLDS} onChange={vi.fn()} />);
    const sliders = screen.getAllByRole('slider');
    // 4 thresholds => 4 ascending boundaries => 4 dividers (one per segment except last)
    expect(sliders.length).toBe(4);
    sliders.forEach((s) => expect(s).toHaveAttribute('tabindex', '0'));
  });

  it('each divider reports the range it can reach: half a point from its neighbours', () => {
    render(<GradeBoundaryBar thresholds={THRESHOLDS} onChange={vi.fn()} />);
    const sliders = screen.getAllByRole('slider');
    // ascending [3,5,7,9] between the scale's ends 0 and 10
    expect([sliders[0].getAttribute('aria-valuemin'), sliders[0].getAttribute('aria-valuemax')]).toEqual(['0.5', '4.5']);
    expect([sliders[1].getAttribute('aria-valuemin'), sliders[1].getAttribute('aria-valuemax')]).toEqual(['3.5', '6.5']);
    expect([sliders[3].getAttribute('aria-valuemin'), sliders[3].getAttribute('aria-valuemax')]).toEqual(['7.5', '9.5']);
  });

  it('names each divider by the grade that starts there', () => {
    render(<GradeBoundaryBar thresholds={THRESHOLDS} onChange={vi.fn()} />);
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual([
      'Where Poor starts', 'Where Adequate starts', 'Where Good starts', 'Where Exemplary starts',
    ]);
  });

  it('divider has aria-valuenow matching its boundary value', () => {
    render(<GradeBoundaryBar thresholds={THRESHOLDS} onChange={vi.fn()} />);
    const sliders = screen.getAllByRole('slider');
    // ascending [3,5,7,9]
    expect(sliders[0]).toHaveAttribute('aria-valuenow', '3');
    expect(sliders[1]).toHaveAttribute('aria-valuenow', '5');
    expect(sliders[2]).toHaveAttribute('aria-valuenow', '7');
    expect(sliders[3]).toHaveAttribute('aria-valuenow', '9');
  });

  it('ArrowRight on first divider increments and calls onChange', () => {
    const onChange = vi.fn();
    render(<GradeBoundaryBar thresholds={THRESHOLDS} onChange={onChange} />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.keyDown(sliders[0], { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const newThresholds = onChange.mock.calls[0][0];
    // ascending boundary 0 (was 3) should have increased
    const newAsc = [...newThresholds].map(([t]) => t).reverse();
    expect(newAsc[0]).toBeGreaterThan(3);
  });

  it('ArrowLeft on first divider decrements and calls onChange', () => {
    // Use a boundary with room to decrease: [2,5,7,9]
    const thresholds = [[9,'Exemplary'],[7,'Good'],[5,'Adequate'],[2,'Poor']];
    const onChange = vi.fn();
    render(<GradeBoundaryBar thresholds={thresholds} onChange={onChange} />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.keyDown(sliders[0], { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const newThresholds = onChange.mock.calls[0][0];
    const newAsc = [...newThresholds].map(([t]) => t).reverse();
    expect(newAsc[0]).toBeLessThan(2);
  });

  it('ArrowUp on divider increments same as ArrowRight', () => {
    const onChange = vi.fn();
    render(<GradeBoundaryBar thresholds={THRESHOLDS} onChange={onChange} />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.keyDown(sliders[0], { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown on divider decrements same as ArrowLeft', () => {
    const thresholds = [[9,'Exemplary'],[7,'Good'],[5,'Adequate'],[2,'Poor']];
    const onChange = vi.fn();
    render(<GradeBoundaryBar thresholds={thresholds} onChange={onChange} />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.keyDown(sliders[0], { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('GradeBoundaryBar segment labels', () => {
  it('keep the full name for screen readers and hover, with a hidden initial for narrow segments', () => {
    render(<GradeBoundaryBar thresholds={THRESHOLDS} onChange={vi.fn()} />);
    const name = screen.getByText('Exemplary');
    expect(name).toHaveClass('gf-boundary-seg__name');
    expect(name.parentElement).toHaveAttribute('title', 'Exemplary');
    expect(name.nextElementSibling).toHaveTextContent('E');
    expect(name.nextElementSibling).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('GradeBoundaryBar segment names', () => {
  it('come from the thresholds, lowest first, under the bottom grade', () => {
    const { container } = render(<GradeBoundaryBar thresholds={THRESHOLDS} onChange={vi.fn()} />);
    const names = [...container.querySelectorAll('.gf-boundary-seg__name')].map((n) => n.textContent);
    expect(names).toEqual(['Critical', 'Poor', 'Adequate', 'Good', 'Exemplary']);
  });
});
