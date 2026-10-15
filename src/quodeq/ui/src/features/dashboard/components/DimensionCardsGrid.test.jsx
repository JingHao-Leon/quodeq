import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DimensionCardsGrid from './DimensionCardsGrid.jsx';

const DIMS = [
  { dimension: 'maintainability', overallScore: '8.0', previousScore: '2.0', overallGrade: 'B', totals: { violationCount: 1, complianceCount: 4, severity: {} } },
];

describe('DimensionCardsGrid', () => {
  it('uses the period-aware delta from dimTrends on the card badge', () => {
    // run-based fallback would render +6.0 (8.0 - 2.0); the period delta is -0.5
    const dimTrends = { maintainability: { delta: -0.5, scores: [8.5, 8.0] } };
    render(<DimensionCardsGrid sortedDimensions={DIMS} dimTrends={dimTrends} />);
    expect(screen.getByText('-0.5')).toBeInTheDocument();
    expect(screen.queryByText('+6.0')).not.toBeInTheDocument();
  });

  it('falls back to overallScore - previousScore when dimTrends is absent', () => {
    render(<DimensionCardsGrid sortedDimensions={DIMS} />);
    expect(screen.getByText('+6.0')).toBeInTheDocument();
  });

  it('keeps card positions fixed (incoming order) regardless of the selected period', () => {
    const dims = [
      { dimension: 'flexibility', overallScore: '7.9', totals: { severity: {} } },
      { dimension: 'reliability', overallScore: '9.7', totals: { severity: {} } },
      { dimension: 'security', overallScore: '9.3', totals: { severity: {} } },
    ];
    // Only reliability was evaluated in the selected bucket. It must NOT jump
    // to the front: changing the selected day/week/month should never reorder
    // the cards, only re-dim them.
    render(
      <DimensionCardsGrid
        sortedDimensions={dims}
        selectedDayDimNames={new Set(['reliability'])}
      />
    );
    const names = [...document.querySelectorAll('.dim-gauge-card__name')].map((el) => el.textContent);
    expect(names).toEqual(['flexibility', 'reliability', 'security']);
  });
});

describe('DimensionCardsGrid, standards not evaluated yet', () => {
  it('adds an empty card per standard switched on without results, opening Evaluate', () => {
    const onEvaluate = vi.fn();
    render(<DimensionCardsGrid sortedDimensions={DIMS} notEvaluated={['accessibility']} onEvaluate={onEvaluate} />);
    const card = screen.getByRole('button', { name: /accessibility: switched on, not evaluated yet/i });
    fireEvent.click(card);
    expect(onEvaluate).toHaveBeenCalled();
  });
});

describe('DimensionCardsGrid, compact (the Overview)', () => {
  it('draws a standard without results as the compact not-evaluated card, still opening Evaluate', () => {
    const onEvaluate = vi.fn();
    render(<DimensionCardsGrid sortedDimensions={DIMS} notEvaluated={['accessibility']} onEvaluate={onEvaluate} compact />);
    const card = screen.getByRole('button', { name: /accessibility: switched on, not evaluated yet/i });
    expect(card).toHaveClass('dim-gauge-card--compact', 'dim-gauge-card--not-evaluated');
    expect(card).toHaveTextContent('NOT EVALUATED');
    expect(card).toHaveTextContent('evaluate to see it here');
    fireEvent.click(card);
    expect(onEvaluate).toHaveBeenCalled();
  });

  it('lights the card its radial point lights, and reports the card the pointer is on', () => {
    const onHover = vi.fn();
    render(<DimensionCardsGrid sortedDimensions={DIMS} compact lit={{ name: 'maintainability', setName: onHover }} />);
    const card = screen.getByRole('button', { name: /maintainability/i });
    expect(card).toHaveClass('dim-gauge-card--compact', 'dim-gauge-card--hl');
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    expect(onHover.mock.calls).toEqual([['maintainability'], [null]]);
  });

  it('puts the caller\'s footer in a compact card, in place of its pass rate', () => {
    const { container } = render(<DimensionCardsGrid sortedDimensions={DIMS} compact footerFor={(item) => <span>{`${item.dimension} moved`}</span>} />);
    expect(screen.getByText('maintainability moved')).toBeInTheDocument();
    expect(container.querySelector('.dim-gauge-card__pass')).toBeNull();
  });
});

describe('DimensionCardsGrid, filled (the run page)', () => {
  it('lays the cards on History\'s tracks with no balanced columns, so one card keeps its size', () => {
    const { container } = render(<DimensionCardsGrid sortedDimensions={DIMS} compact fill />);
    const grid = container.querySelector('.dimensions-grid');
    expect(grid).toHaveClass('dimensions-grid--fill');
    expect(grid.style.gridTemplateColumns).toBe('');
  });
});
