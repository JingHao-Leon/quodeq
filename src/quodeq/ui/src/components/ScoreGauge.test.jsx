import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ScoreGauge, InsufficientGauge, computeGaugeRing } from './ScoreGauge.jsx';
import { t } from '../strings/index.js';

describe('ScoreGauge', () => {
  it('computeGaugeRing fills the ring by the share of the scale, in the grade colour', () => {
    const full = computeGaugeRing('10');
    const half = computeGaugeRing('5.0');
    expect(full.dashOffset).toBeCloseTo(0);
    expect(half.dashOffset).toBeCloseTo(computeGaugeRing('0').dashOffset / 2);
    expect(half.scoreDisplay).toBe('5.0');
    expect(full.gradeWord).toBe(full.gradeWord.toUpperCase());
    expect(full.ringColor.startsWith('var(--')).toBe(true);
  });

  it('a score that does not parse draws an empty muted ring and no grade word', () => {
    const ring = computeGaugeRing(null);
    expect(ring.gradeWord).toBeNull();
    expect(ring.ringColor).toBe('var(--color-text-muted)');
    expect(ring.dashOffset).toBeCloseTo(computeGaugeRing('0').dashOffset);
  });

  it('draws the score and the grade word inside the ring, hidden from assistive tech', () => {
    const { container } = render(<ScoreGauge {...computeGaugeRing('7.7')} />);
    expect(screen.getByText('7.7')).toBeInTheDocument();
    expect(container.querySelector('.dim-gauge-card__gauge')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('the insufficient ring is dashed, with the reason under it', () => {
    const { container } = render(<InsufficientGauge />);
    expect(container.querySelector('circle')).toHaveAttribute('stroke-dasharray', '3 4');
    expect(screen.getByText(t('overview.insufficientEvidence'))).toBeInTheDocument();
  });
});
