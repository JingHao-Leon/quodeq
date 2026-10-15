import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RunDetail from './RunDetail.jsx';
import { run, baseline, diff } from './runDetail.fixtures.js';

function renderDetail(over = {}) {
  const props = { run, baseline, diff, throughput: null, tab: 'dimensions', onTab: vi.fn(), onOpenRun: vi.fn(), onOpenFinding: vi.fn(), onOpenDimension: vi.fn(), onDelete: vi.fn(), ...over };
  render(<RunDetail {...props} />);
  return props;
}

describe('RunDetail', () => {
  it('dimensions first; majors change against the comparison run', () => {
    renderDetail();
    expect(screen.getByRole('tab', { name: /dimensions/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('96 maj', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/\+8/)).toBeInTheDocument();
  });

  it('a new finding opens in this run', () => {
    const p = renderDetail({ tab: 'new' });
    fireEvent.click(screen.getByText('Uncaught exception'));
    expect(p.onOpenFinding).toHaveBeenCalledWith(diff.new[0], run, null);
  });

  it('the foot names the comparison run and the unchecked count', () => {
    renderDetail();
    expect(screen.getByText(/15 not re-checked/)).toBeInTheDocument();
    expect(screen.getByText(/same dimensions, same model/)).toBeInTheDocument();
  });

  it('identity line has commit and took, and no scope', () => {
    renderDetail();
    expect(screen.getByText('6d62f65 · took 3h 30m')).toBeInTheDocument();
    expect(screen.queryByText(/scope/)).not.toBeInTheDocument();
  });

  it('other-model comparison is labelled; no baseline says nothing to compare', () => {
    renderDetail({ run: { ...run, baselineKind: 'other-model' } });
    expect(screen.getByText(/different model \(gpt-6-luna\)/)).toBeInTheDocument();
  });

  it('a zero tab is disabled', () => {
    renderDetail({ run: { ...run, counts: { ...run.counts, new: 0 } }, diff: { ...diff, new: [], newSev: {} } });
    expect(screen.getByRole('tab', { name: /new/ })).toBeDisabled();
    expect(screen.getByRole('tab', { name: /resolved/ })).toBeEnabled();
  });

  it('first run: nothing to compare with and no change tabs', () => {
    renderDetail({ baseline: null, diff: null });
    expect(screen.getByText(/nothing to compare with/)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /resolved/ })).not.toBeInTheDocument();
  });

  it('tab numbers are the complete counts, the foot says how many are not listed', () => {
    const list = Array.from({ length: 200 }, (_, i) => ({ ...diff.new[0], line: i }));
    renderDetail({ tab: 'new', run: { ...run, counts: { ...run.counts, new: 250 } }, diff: { ...diff, new: list } });
    expect(screen.getByRole('tab', { name: /\+250/ })).toBeInTheDocument();
    expect(screen.getByText(/\+ 50 more/)).toBeInTheDocument();
  });

  it('a critical count that fell to zero still shows, with its change', () => {
    renderDetail({ baseline: { ...baseline, critical: 2 } });
    expect(screen.getByText(/0 crit/)).toBeInTheDocument();
    expect(screen.getByText(/[-−]2/)).toBeInTheDocument();
  });

  it('files analysed reads count and rate', () => {
    renderDetail({ throughput: { files: 821, perMin: 3.9 } });
    expect(screen.getByText(/821 files · 3\.9\/min/)).toBeInTheDocument();
  });

  it('the dimensions show as cards, the hero keeps the grade word', () => {
    renderDetail();
    const card = screen.getByText('security').closest('.dim-gauge-card');
    expect(card).toHaveClass('dim-gauge-card--compact');
    expect(card.querySelector('.dim-gauge-card__score')).toHaveTextContent('8.4');
    expect(document.querySelector('.rl-hero .chip').textContent).toBe('GOOD');
  });

  it('a cancelled run says how it stopped and what it finished, under the identity line', () => {
    renderDetail({ run: { ...run, partial: true, plannedDims: ['performance', 'security'], exitReason: 'signal_SIGTERM' }, baseline: null, diff: null });
    const note = screen.getByText(/^Cancelled after 3h 30m \(stopped by a signal\)\./);
    expect(note).toHaveTextContent('1 of 2 dimensions finished; performance did not.');
    expect(note.previousElementSibling).toHaveTextContent('6d62f65 · took 3h 30m');
  });

  it('a finished run has no cancelled line', () => {
    renderDetail();
    expect(screen.queryByText(/Cancelled/)).not.toBeInTheDocument();
  });

  it('a dimension card opens that dimension', () => {
    const p = renderDetail();
    fireEvent.click(screen.getByText('security').closest('.dim-gauge-card'));
    expect(p.onOpenDimension).toHaveBeenCalledWith(run.dimensionDetails[0]);
  });
});
