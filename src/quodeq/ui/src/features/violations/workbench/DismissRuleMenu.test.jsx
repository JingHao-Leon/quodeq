import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import DismissRuleMenu from './DismissRuleMenu.jsx';

const row = {
  key: 'reliability:R-FT-2', req: 'R-FT-2', dimension: 'reliability', runId: 'run-1', principle: 'Fault Tolerance', now: 3,
  violations: [{ principle: 'Fault Tolerance' }, { principle: 'Fault Tolerance' }, { principle: 'Other' }],
};

describe('DismissRuleMenu', () => {
  it('keeps the bulk dismiss behind a ⋯ named for the rule, its menu outside the panel', async () => {
    const { container } = render(<div className="wb-detail"><DismissRuleMenu row={row} onDismissType={vi.fn()} /></div>);
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.queryByText(/Dismiss all/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'more actions on R-FT-2' }));
    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    expect(screen.getByRole('menuitem', { name: 'Dismiss all 3 R-FT-2 in this project' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dismiss all 2 R-FT-2 in Fault Tolerance' })).toBeInTheDocument();
  });

  it('picking a scope dismisses the rule in it', async () => {
    const onDismissType = vi.fn();
    render(<DismissRuleMenu row={row} onDismissType={onDismissType} />);
    await userEvent.click(screen.getByRole('button', { name: 'more actions on R-FT-2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dismiss all 2 R-FT-2 in Fault Tolerance' }));
    expect(onDismissType).toHaveBeenCalledWith(row, 'principle');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
