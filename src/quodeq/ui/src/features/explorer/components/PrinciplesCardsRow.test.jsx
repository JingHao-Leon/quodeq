import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import PrinciplesCardsRow, { columnsFor } from './PrinciplesCardsRow.jsx';

const PRINCIPLES = [
  { principle: 'modifiability', score: '4.7', grade: 'Poor', violationCount: 116, severity: { critical: 0, major: 11, minor: 105 } },
  { principle: 'analyzability', grade: 'Insufficient' },
];

describe('PrinciplesCardsRow', () => {
  it('renders one card per principle', () => {
    render(<PrinciplesCardsRow principles={PRINCIPLES} onPrincipleClick={() => {}} />);
    expect(screen.getByText('modifiability')).toBeInTheDocument();
    expect(screen.getByText('analyzability')).toBeInTheDocument();
  });

  it('renders insufficient state for grade=Insufficient', () => {
    const { container } = render(<PrinciplesCardsRow principles={PRINCIPLES} onPrincipleClick={() => {}} />);
    expect(container.querySelector('.dim-gauge-card__gauge--insuf')).not.toBeNull();
    expect([...container.querySelectorAll('.dim-gauge-card__gradeword')].map((n) => n.textContent)).toContain('INSUFFICIENT');
  });

  it('forwards click to onPrincipleClick with the principle name', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PrinciplesCardsRow principles={PRINCIPLES} onPrincipleClick={onClick} />);
    await user.click(screen.getByText('modifiability'));
    expect(onClick).toHaveBeenCalledWith('modifiability');
  });

  it('puts the weakest first, ungraded ones last', () => {
    const principles = [
      { principle: 'b-strong', score: '9.1' }, { principle: 'ungraded', grade: 'Insufficient' }, { principle: 'a-weak', score: '3.2' }, { principle: 'mid', score: '6' },
    ];
    const { container } = render(<PrinciplesCardsRow principles={principles} />);
    expect([...container.querySelectorAll('.dim-gauge-card__name')].map((n) => n.textContent)).toEqual(['a-weak', 'mid', 'b-strong', 'ungraded']);
  });

  it('all on one row up to five, two even rows past five', () => {
    expect([1, 3, 5, 6, 7, 8, 10].map(columnsFor)).toEqual([1, 3, 5, 3, 4, 4, 5]);
    expect(columnsFor(0)).toBe(1);
    const { container } = render(<PrinciplesCardsRow principles={Array.from({ length: 7 }, (_, i) => ({ principle: `p${i}`, score: '5' }))} />);
    expect(container.querySelector('.qd-cards-row').style.getPropertyValue('--qd-cards-cols')).toBe('4');
  });

  it('lights the highlighted card, reports the hovered one, and shows each card\'s change', () => {
    const onHover = vi.fn();
    const { container } = render(<PrinciplesCardsRow principles={PRINCIPLES} highlighted="analyzability" onHover={onHover}
      deltas={new Map([['modifiability', 0.6]])} />);
    const [weak, ungraded] = container.querySelectorAll('article');
    expect(ungraded).toHaveClass('dim-gauge-card--hl');
    expect(weak).not.toHaveClass('dim-gauge-card--hl');
    expect(weak.querySelector('.trend-badge')).toHaveTextContent('+0.6');
    fireEvent.mouseEnter(weak);
    fireEvent.mouseLeave(weak);
    expect(onHover.mock.calls).toEqual([['modifiability'], [null]]);
  });
});
