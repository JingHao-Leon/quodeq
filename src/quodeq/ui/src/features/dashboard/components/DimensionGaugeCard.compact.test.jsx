import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DimensionGaugeCard, { passPctOf } from './DimensionGaugeCard.jsx';
import { t } from '../../../strings/index.js';

const item = {
  dimension: 'Input Validation', overallScore: '6.4', fromDateLabel: 'Oct 14',
  totals: { violationCount: 12, complianceCount: 36, severity: { critical: 1, major: 3, minor: 8 } },
};
const card = (props = {}) => render(<DimensionGaugeCard item={item} onDimensionClick={vi.fn()} compact showDate={false} {...props} />);

describe('DimensionGaugeCard, compact', () => {
  it('names the principle on top (its full name as a tooltip), the ring holds the score only', () => {
    const { container } = card();
    expect(container.querySelector('.dim-gauge-card__top .dim-gauge-card__name')).toHaveAttribute('title', 'Input Validation');
    expect(container.querySelector('.dim-gauge-card__mini .dim-gauge-card__score')).toHaveTextContent('6.4');
    expect(container.querySelector('.dim-gauge-card__mini .dim-gauge-card__grade')).toBeNull();
  });

  it('beside the ring: the grade word in the ring\'s colour, the severities as pills, the pass rate', () => {
    const { container } = card();
    const word = container.querySelector('.dim-gauge-card__gradeword');
    expect(word.textContent).toMatch(/^[A-Z]+$/);
    expect(word.style.color).not.toBe('');
    expect([...container.querySelectorAll('.dim-gauge-card__pills .term-sev-badge--count-abbr')].map((n) => n.textContent)).toEqual(['1 crit', '3 maj', '8 min']);
    expect(container.querySelector('.dim-gauge-card__pass')).toHaveTextContent(t('overview.cardPass', { pct: 75 }));
  });

  it('a footer takes the pass rate\'s place', () => {
    const { container } = card({ footer: <span className="probe-footer">run changes</span> });
    expect(container.querySelector('.dim-gauge-card__rowbody .probe-footer')).toHaveTextContent('run changes');
    expect(container.querySelector('.dim-gauge-card__pass')).toBeNull();
  });

  it('has no date line ("Latest") when asked not to', () => {
    const { container } = card();
    expect(container.querySelector('.dim-gauge-card__coverage-line')).toBeNull();
  });

  it('shows the trend from a twentieth of a point, not under it', () => {
    const { container, rerender } = card({ delta: 0.04 });
    expect(container.querySelector('.trend-badge')).toBeNull();
    rerender(<DimensionGaugeCard item={item} onDimensionClick={vi.fn()} compact showDate={false} delta={-0.3} />);
    expect(container.querySelector('.dim-gauge-card__top .trend-badge')).toHaveTextContent('-0.3');
  });

  it('an insufficient principle says so beside its dashed ring', () => {
    const { container } = card({ isInsufficient: true, item: { dimension: 'Secrets', overallScore: null } });
    expect(container.querySelector('.dim-gauge-card__gauge--insuf')).not.toBeNull();
    expect(container.querySelector('.dim-gauge-card__gradeword')).toHaveTextContent(t('overview.insufficientGrade'));
    expect(container.querySelector('.dim-gauge-card__pills')).toBeNull();
  });

  it('hover and keyboard focus light it, and leaving puts it out', () => {
    const onHover = vi.fn();
    const { container } = card({ onHover, highlighted: true });
    const article = container.querySelector('article');
    expect(article).toHaveClass('dim-gauge-card--compact', 'dim-gauge-card--hl');
    fireEvent.mouseEnter(article);
    fireEvent.mouseLeave(article);
    fireEvent.focus(article);
    fireEvent.blur(article);
    expect(onHover.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('the full card keeps its date line and its ring\'s grade word', () => {
    const { container } = render(<DimensionGaugeCard item={item} onDimensionClick={vi.fn()} />);
    expect(container.querySelector('.dim-gauge-card__coverage-line')).toHaveTextContent('Oct 14');
    expect(container.querySelector('.dim-gauge-card__grade')).not.toBeNull();
    expect(container.querySelector('.dim-gauge-card__gradeword')).toBeNull();
  });
});

describe('passPctOf', () => {
  it('is compliant checks over all checks, null with none', () => {
    expect(passPctOf(item)).toBe(75);
    expect(passPctOf({ totals: {} })).toBeNull();
  });
});
