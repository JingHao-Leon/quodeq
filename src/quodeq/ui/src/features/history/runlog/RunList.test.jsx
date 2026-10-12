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

  it('shows the scope only for a partial run', () => {
    const partial = [{ ...rows[0], partial: true, dims: ['security', 'reliability'] }, rows[1]];
    render(<RunList rows={partial} selectedId="a" onSelect={vi.fn()} hoverId={null} onHover={vi.fn()} />);
    expect(screen.getByText(/sec · rel|rel · sec/)).toBeInTheDocument();
    expect(screen.queryByText(/dims/)).not.toBeInTheDocument();
  });
});
