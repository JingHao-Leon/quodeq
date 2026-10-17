import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MoreMenu from './MoreMenu.jsx';

describe('MoreMenu', () => {
  it('keeps its actions behind the ⋯ and runs a pick once, closing the menu', () => {
    const onDelete = vi.fn();
    render(<MoreMenu ariaLabel="more" items={[{ key: 'a', label: 'Keep', onPick: vi.fn() }, { key: 'd', label: 'Delete', onPick: onDelete, danger: true }]} />);
    expect(screen.queryByRole('menuitem')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'more' }));
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    expect(del).toHaveClass('compare-dueltrigger__item--danger');
    expect(screen.getByRole('menuitem', { name: 'Keep' })).not.toHaveClass('compare-dueltrigger__item--danger');
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
