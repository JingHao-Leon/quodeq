import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SinceStrip from './SinceStrip.jsx';

const summary = (over = {}) => ({ newCount: 4, resolvedCount: 2, typesOpened: 0, typesClosed: 0, ...over });

describe('SinceStrip', () => {
  it('names the period of the chart\'s grouping, and the new and fixed findings', () => {
    render(<SinceStrip summary={summary()} granularity="week" />);
    expect(screen.getByRole('region', { name: 'since the previous week' })).toBeInTheDocument();
    expect(screen.getByText('4 new')).toBeInTheDocument();
    expect(screen.getByText('2 fixed')).toBeInTheDocument();
  });

  it('says so in one quiet line when nothing changed', () => {
    render(<SinceStrip summary={summary({ newCount: 0, resolvedCount: 0 })} />);
    expect(screen.getByText('no new or fixed findings')).toBeInTheDocument();
    expect(screen.queryByText('0 new')).not.toBeInTheDocument();
  });

  it('shows the rules opened and closed only when some did', () => {
    const { rerender } = render(<SinceStrip summary={summary()} />);
    expect(screen.queryByText(/rules? opened/)).not.toBeInTheDocument();
    rerender(<SinceStrip summary={summary({ typesOpened: 3, typesClosed: 1 })} />);
    expect(screen.getByText('3 rules opened')).toBeInTheDocument();
    expect(screen.getByText('1 closed')).toBeInTheDocument();
  });

  it('keeps its row with a tip, small and on one line, when there is nothing to compare', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // the first tip, which bolds its point
    const { container } = render(<SinceStrip summary={null} />);
    const row = container.querySelector('.overview-since.overview-since--tip');
    expect(row).not.toBeNull();
    expect(row.querySelector('.overview-since__tip')).not.toBeNull();
    expect(row.querySelector('.overview-since__tip strong')).not.toBeNull(); // the tip's bold survives
    expect(screen.queryByText(/new$/)).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('takes the caller\'s label', () => {
    render(<SinceStrip summary={summary()} label="since the previous run" />);
    expect(screen.getByRole('region', { name: 'since the previous run' })).toHaveTextContent('4 new');
  });

  it('says why there is nothing to count without a summary', () => {
    render(<SinceStrip summary={null} label="since the previous run" emptyNote="nothing to compare with" />);
    expect(screen.getByRole('region', { name: 'since the previous run' })).toHaveTextContent('nothing to compare with');
    expect(screen.queryByText('4 new')).not.toBeInTheDocument();
  });
});
