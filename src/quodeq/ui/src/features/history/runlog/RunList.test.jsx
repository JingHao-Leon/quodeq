import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RunList from './RunList.jsx';

const base = { dims: ['security'], partial: false, score: 8.5, grade: 'Good', origin: null, startedAt: '2026-10-11T00:45:04+00:00' };
const rows = [
  { ...base, runId: 'a', baselineRunId: 'b', baselineKind: 'same-model', counts: { new: 69, resolved: 27 }, pending: false },
  { ...base, runId: 'b', baselineRunId: null, baselineKind: null, counts: null, pending: false, startedAt: '2026-10-10T01:36:00+00:00' },
  { ...base, runId: 'c', baselineRunId: 'b', baselineKind: 'other-model', counts: { new: 4, resolved: 1 }, pending: false, startedAt: '2026-10-09T01:00:00+00:00' },
  { ...base, runId: 'd', baselineRunId: 'b', baselineKind: 'same-model', counts: null, pending: true, startedAt: '2026-10-08T01:00:00+00:00' },
];

describe('RunList', () => {
  it('shows new and resolved, a dash without a comparison, a placeholder while pending', () => {
    render(<RunList rows={rows} selectedId="a" onSelect={vi.fn()} hoverId={null} onHover={vi.fn()} />);
    expect(screen.getByText('+69')).toBeInTheDocument();
    expect(screen.getByText('−27')).toBeInTheDocument();
    expect(screen.getByTitle(/no earlier run with these dimensions/)).toBeInTheDocument();
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('an other-model comparison says so in its tooltip', () => {
    render(<RunList rows={rows} selectedId="a" onSelect={vi.fn()} hoverId={null} onHover={vi.fn()} />);
    expect(screen.getByTitle('compared with a run of another model')).toBeInTheDocument();
  });

  it('day labels head each day; clicking a row selects it', () => {
    const onSelect = vi.fn();
    render(<RunList rows={rows} selectedId="a" onSelect={onSelect} hoverId={null} onHover={vi.fn()} />);
    expect(screen.getAllByText(/Oct/).length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByText('+4'));
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('a cancelled run reads how far it got, its dimensions in the tooltip; a full run shows no scope', () => {
    const cancelled = { ...rows[0], partial: true, dims: ['reliability', 'security'], plannedDims: ['performance', 'reliability', 'security'] };
    render(<RunList rows={[cancelled, rows[1]]} selectedId="a" onSelect={vi.fn()} hoverId={null} onHover={vi.fn()} />);
    expect(screen.getByText('cancelled · 2 of 3')).toHaveAttribute('title', 'reliability, security');
    expect(screen.getAllByText(/cancelled/)).toHaveLength(1);
  });

  it('a cancelled run that recorded no plan counts its dimensions', () => {
    const cancelled = { ...rows[0], partial: true, dims: ['reliability', 'security'] };
    render(<RunList rows={[cancelled]} selectedId="a" onSelect={vi.fn()} hoverId={null} onHover={vi.fn()} />);
    expect(screen.getByText('cancelled · 2 dims')).toBeInTheDocument();
  });

  it('focus follows the selection while it is in the list', () => {
    const props = { rows, onSelect: vi.fn(), hoverId: null, onHover: vi.fn() };
    const { rerender, container } = render(<RunList {...props} selectedId="a" />);
    container.querySelector('.rl-row.is-sel').focus();
    rerender(<RunList {...props} selectedId="c" />);
    expect(document.activeElement).toBe(container.querySelector('.rl-row.is-sel'));
    expect(document.activeElement).toHaveTextContent('+4');
  });

  it('never takes focus from outside the list', () => {
    const props = { rows, onSelect: vi.fn(), hoverId: null, onHover: vi.fn() };
    const { rerender } = render(<><input aria-label="outside" /><RunList {...props} selectedId="a" /></>);
    const outside = screen.getByLabelText('outside');
    outside.focus();
    rerender(<><input aria-label="outside" /><RunList {...props} selectedId="c" /></>);
    expect(document.activeElement).toBe(outside);
  });
});
