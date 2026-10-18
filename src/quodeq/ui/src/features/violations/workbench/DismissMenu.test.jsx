import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import DismissMenu from './DismissMenu.jsx';

const row = {
  key: 'reliability:R-FT-2', req: 'R-FT-2', dimension: 'reliability', runId: 'run-1', principle: 'Fault Tolerance', now: 3,
  violations: [{ principle: 'Fault Tolerance' }, { principle: 'Fault Tolerance' }, { principle: 'Other' }],
};

describe('DismissMenu', () => {
  it('one pill holds this finding and the rule scopes, its menu outside the panel', async () => {
    const { container } = render(<div className="wb-detail"><DismissMenu row={row} onDismiss={vi.fn()} onDismissType={vi.fn()} /></div>);
    expect(screen.queryByRole('menuitem')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'dismiss this finding or all R-FT-2' }));
    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    expect(screen.getByRole('menuitem', { name: 'Dismiss this finding' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dismiss all 3 R-FT-2 in this project' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dismiss all 2 R-FT-2 in Fault Tolerance' })).toBeInTheDocument();
  });

  it('picking a scope dismisses the rule in it', async () => {
    const onDismissType = vi.fn();
    render(<DismissMenu row={row} onDismiss={vi.fn()} onDismissType={onDismissType} />);
    await userEvent.click(screen.getByRole('button', { name: 'dismiss this finding or all R-FT-2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dismiss all 2 R-FT-2 in Fault Tolerance' }));
    expect(onDismissType).toHaveBeenCalledWith(row, 'principle');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('without a rule row the pill dismisses the finding at once', async () => {
    const onDismiss = vi.fn();
    render(<DismissMenu row={null} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
