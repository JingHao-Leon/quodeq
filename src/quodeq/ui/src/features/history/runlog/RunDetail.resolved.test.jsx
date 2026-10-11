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

describe('RunDetail resolved and actions', () => {
  it('a resolved finding opens in the comparison run', () => {
    const p = renderDetail({ tab: 'resolved' });
    fireEvent.click(screen.getByText('Old'));
    expect(p.onOpenFinding).toHaveBeenCalledWith(diff.resolved[0], baseline, run);
  });

  it('delete lives behind the more menu', () => {
    const p = renderDetail();
    expect(screen.queryByText('delete this run')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'more actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'delete this run' }));
    expect(p.onDelete).toHaveBeenCalledWith('a', expect.any(String));
  });

  it('open run and GitHub actions', () => {
    const p = renderDetail();
    fireEvent.click(screen.getByText('open run'));
    expect(p.onOpenRun).toHaveBeenCalledWith(run);
    expect(screen.getByText('GitHub ↗')).toHaveAttribute('href', 'https://x');
  });

  it('tab badges use the complete severity counts, not the capped lists', () => {
    renderDetail({ run: { ...run, counts: { ...run.counts, new: 250, resolved: 140 }, newSev: { major: 130 }, resolvedSev: { major: 70 } } });
    expect(screen.getByRole('tab', { name: /new/ })).toHaveTextContent('130 maj');
    expect(screen.getByRole('tab', { name: /resolved/ })).toHaveTextContent('70 maj');
  });
});
