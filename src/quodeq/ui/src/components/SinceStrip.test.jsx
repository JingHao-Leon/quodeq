import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('shows the rule types only when some opened or closed', () => {
    const { rerender } = render(<SinceStrip summary={summary()} />);
    expect(screen.queryByText(/rule types opened/)).not.toBeInTheDocument();
    rerender(<SinceStrip summary={summary({ typesOpened: 3, typesClosed: 1 })} />);
    expect(screen.getByText('3 rule types opened')).toBeInTheDocument();
    expect(screen.getByText('1 closed')).toBeInTheDocument();
  });

  it('opens a dimension that moved most', () => {
    const onMover = vi.fn();
    render(<SinceStrip summary={summary()} movers={[{ name: 'security', delta: -0.6 }]} onMover={onMover} />);
    fireEvent.click(screen.getByRole('button', { name: /security/ }));
    expect(onMover).toHaveBeenCalledWith('security');
  });

  it('renders nothing without a summary', () => {
    const { container } = render(<SinceStrip summary={null} />);
    expect(container).toBeEmptyDOMElement();
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
