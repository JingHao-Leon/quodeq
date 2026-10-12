import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import CompareDimensionHeader from './CompareDimensionHeader.jsx';

const board = [
  { key: 'security', label: 'Security' },
  { key: 'maintainability', label: 'Maintainability' },
];

const view = {
  key: 'maintainability',
  label: 'Maintainability',
  principles: [{ key: 'modularity' }],
  standings: [{ id: 'alpha' }],
  violations: 12,
  avg: 7.5,
  delta: 0.4,
};

const switcher = () => screen.getByRole('button', { name: 'Switch dimension, Maintainability is open' });

describe('CompareDimensionHeader accessibility (#6521)', () => {
  it('the switcher is a menu button that names the open dimension in full', () => {
    render(<CompareDimensionHeader view={view} board={board} onOpenDimension={vi.fn()} />);
    expect(switcher()).toHaveAttribute('aria-haspopup', 'menu');
    expect(switcher()).toHaveTextContent('dimension: Maintainability');
  });

  it('its menu ticks the open dimension and lists the others by full name', async () => {
    render(<CompareDimensionHeader view={view} board={board} onOpenDimension={vi.fn()} />);
    await userEvent.click(switcher());
    expect(screen.getByRole('menuitemradio', { name: /Maintainability/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /Security/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('picking a dimension opens it', async () => {
    const onOpenDimension = vi.fn();
    render(<CompareDimensionHeader view={view} board={board} onOpenDimension={onOpenDimension} />);
    await userEvent.click(switcher());
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Security/ }));
    expect(onOpenDimension).toHaveBeenCalledWith('security');
  });
});
