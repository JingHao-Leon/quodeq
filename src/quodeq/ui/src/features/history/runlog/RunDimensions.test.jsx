import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RunDimensions from './RunDimensions.jsx';

const run = { dimensionDetails: [
  { dimension: 'security', score: 8, majors: 3, critical: 1 },
  { dimension: 'reliability', score: 6.42, majors: 9, critical: 0 },
  { dimension: 'usability', score: null, majors: 0, critical: 0 },
] };
const diff = { perDim: {
  security: { new: 4, resolved: 2, newSev: { critical: 1, major: 2, minor: 1 }, resolvedSev: { major: 1 } },
  reliability: { new: 0, resolved: 0, newSev: {}, resolvedSev: {} },
} };

const names = (c) => [...c.querySelectorAll('.dim-gauge-card__name')].map((n) => n.textContent);
const cardOf = (name) => screen.getByText(name).closest('.dim-gauge-card');

describe('RunDimensions', () => {
  it('one compact card per dimension, weakest first, ungraded last', () => {
    const { container } = render(<RunDimensions run={run} diff={diff} onOpen={vi.fn()} />);
    expect(container.querySelector('.qd-cards-row.rl-cards')).not.toBeNull();
    expect(container.querySelectorAll('.dim-gauge-card--compact')).toHaveLength(3);
    expect(names(container)).toEqual(['reliability', 'security', 'usability']);
  });

  it('scores read with one decimal', () => {
    render(<RunDimensions run={run} diff={diff} onOpen={vi.fn()} />);
    expect(cardOf('security').querySelector('.dim-gauge-card__score')).toHaveTextContent('8.0');
    expect(cardOf('reliability').querySelector('.dim-gauge-card__score')).toHaveTextContent('6.4');
  });

  it('the footer has the new and fixed lines with their criticals and majors only', () => {
    render(<RunDimensions run={run} diff={diff} onOpen={vi.fn()} />);
    const lines = [...cardOf('security').querySelectorAll('.rl-card-move')].map((n) => n.textContent);
    expect(lines).toEqual(['+4 new1 crit · 2 maj', '−2 fixed1 maj']);
    expect(cardOf('security').querySelector('.dim-gauge-card__pass')).toBeNull();
  });

  it('zero counts read muted', () => {
    render(<RunDimensions run={run} diff={diff} onOpen={vi.fn()} />);
    const counts = [...cardOf('reliability').querySelectorAll('.rl-card-move > span:first-child')];
    expect(counts.map((n) => n.className)).toEqual(['rl-zero', 'rl-zero']);
  });

  it('a dimension the run was not compared on says so; no diff at all says so on every card', () => {
    const { rerender } = render(<RunDimensions run={run} diff={diff} onOpen={vi.fn()} />);
    expect(cardOf('usability')).toHaveTextContent('not compared');
    rerender(<RunDimensions run={run} diff={null} onOpen={vi.fn()} />);
    expect(screen.getAllByText('not compared')).toHaveLength(3);
  });

  it('a card opens its dimension', () => {
    const onOpen = vi.fn();
    render(<RunDimensions run={run} diff={diff} onOpen={onOpen} />);
    fireEvent.click(cardOf('reliability'));
    expect(onOpen).toHaveBeenCalledWith(run.dimensionDetails[1]);
  });
});
