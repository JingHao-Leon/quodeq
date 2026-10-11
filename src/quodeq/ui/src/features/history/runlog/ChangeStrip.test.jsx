import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ChangeStrip from './ChangeStrip.jsx';

const rows = Array.from({ length: 25 }, (_, i) => ({ runId: `r${i}`, startedAt: '2026-10-11T00:45:04+00:00', counts: { new: i === 3 ? 1132 : 10, resolved: 2 }, pending: false }));
const props = { rows, selectedId: 'r0', onSelect: vi.fn(), hoverId: null, onHover: vi.fn(), start: null };

describe('ChangeStrip', () => {
  it('shows 20 of 25 and pages to older runs', () => {
    const onPage = vi.fn();
    render(<ChangeStrip {...props} onPage={onPage} />);
    expect(screen.getByText(/1–20 of 25/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /older runs/i }));
    expect(onPage).toHaveBeenCalledWith(5);
  });

  it('prints every count, clipped bars included', () => {
    render(<ChangeStrip {...props} onPage={vi.fn()} />);
    expect(screen.getByText('1132')).toBeInTheDocument();
    expect(document.querySelectorAll('.rl-strip__break').length).toBeGreaterThan(0);
  });

  it('gives keyboard users one button per bar that selects the run', () => {
    const onSelect = vi.fn();
    render(<ChangeStrip {...props} onSelect={onSelect} onPage={vi.fn()} />);
    const items = screen.getAllByRole('button', { name: /new, 2 resolved/ });
    expect(items).toHaveLength(20);
    fireEvent.click(items[0]);
    expect(onSelect).toHaveBeenCalled();
  });
});
