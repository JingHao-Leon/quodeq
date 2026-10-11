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

  it('identity strip has commit and took, and no scope cell', () => {
    renderDetail();
    expect(screen.getByText('6d62f65')).toBeInTheDocument();
    expect(screen.getByText('3h 30m')).toBeInTheDocument();
    expect(screen.queryByText('scope')).not.toBeInTheDocument();
  });

  it('other-model comparison is labelled; no baseline says nothing to compare', () => {
    renderDetail({ run: { ...run, baselineKind: 'other-model' } });
    expect(screen.getByText(/different model \(qwen\)/)).toBeInTheDocument();
  });

  it('a zero tab is disabled', () => {
    renderDetail({ diff: { ...diff, new: [], newSev: {} } });
    expect(screen.getByRole('tab', { name: /new/ })).toBeDisabled();
    expect(screen.getByRole('tab', { name: /resolved/ })).toBeEnabled();
  });

  it('first run: nothing to compare with and no change tabs', () => {
    renderDetail({ baseline: null, diff: null });
    expect(screen.getByText(/nothing to compare with/)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /resolved/ })).not.toBeInTheDocument();
  });

  it('says how many findings are not listed', () => {
    renderDetail({ tab: 'new', run: { ...run, counts: { ...run.counts, new: 250 } } });
    expect(screen.getByText(/\+ 249 more/)).toBeInTheDocument();
  });
});
