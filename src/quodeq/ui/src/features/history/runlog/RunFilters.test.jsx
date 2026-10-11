import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RunFilters from './RunFilters.jsx';
import RunningLine from './RunningLine.jsx';

const rows = [
  { runId: 'a', model: 'm1', origin: { kind: 'ci', workflow: 'Quodeq Nightly' } },
  { runId: 'b', model: 'm2', origin: { kind: 'app' } },
  { runId: 'c', model: 'm2', origin: { kind: 'app' } },
];

describe('RunFilters', () => {
  it('lists the models with their run counts and reports the pick', () => {
    const onModel = vi.fn();
    render(<RunFilters rows={rows} origin="all" model="all" onOrigin={vi.fn()} onModel={onModel} shown={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'filter by model' }));
    expect(screen.getByRole('menuitemradio', { name: /all/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /m2/ }));
    expect(onModel).toHaveBeenCalledWith('m2');
  });

  it('shows how many runs survive once a filter is on', () => {
    render(<RunFilters rows={rows} origin="app" model="all" onOrigin={vi.fn()} onModel={vi.fn()} shown={2} />);
    expect(screen.getByText('2 of 3 runs')).toBeInTheDocument();
  });
});

describe('RunningLine', () => {
  it('renders nothing without a job and offers evaluate with one', () => {
    const onNavigate = vi.fn();
    const { container, rerender } = render(<RunningLine job={null} onNavigate={onNavigate} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RunningLine job={{ model: 'm1', currentDimension: 'security', startedAt: '2026-10-11T00:45:04+00:00' }} onNavigate={onNavigate} />);
    expect(screen.getByText(/on security/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open in evaluate/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
