import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ReqRail from './ReqRail.jsx';
import { t } from '../../../strings/index.js';

const RAIL = {
  failing: [{ req: 'R2', text: 'No secrets in code', sev: { critical: 1 }, fileCount: 1 }, { req: 'R1', text: 'Validate input', sev: { major: 2 }, fileCount: 3 }],
  passing: [{ req: 'R3', text: 'Holds', count: 2 }],
};
const rail = (props = {}) => render(<ReqRail rail={RAIL} total={3} selected={null} onSelect={vi.fn()} {...props} />);
const items = (container) => [...container.querySelectorAll('.req-rail__item')];

describe('ReqRail', () => {
  it('lists All, the failing requirements worst first, then "Passing · N"', () => {
    const { container } = rail();
    expect(screen.getByText(t('violations.scopeRailLabel', { count: 3 }))).toBeInTheDocument();
    expect(items(container).map((n) => n.querySelector('.req-rail__id, .req-rail__all').textContent)).toEqual([t('violations.scopeRailAll'), 'R2', 'R1', '✓ R3']);
    expect(screen.getByText(t('violations.scopeRailPassing', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(t('violations.scopeRailFile'))).toBeInTheDocument();
    expect(screen.getByText(t('violations.scopeRailFiles', { count: 3 }))).toBeInTheDocument();
    expect(container.querySelector('.req-rail__item--pass')).toHaveTextContent('Holds');
  });

  it('All is pressed with nothing picked; a requirement picks itself, and again goes back to All', () => {
    const onSelect = vi.fn();
    const { container, rerender } = rail({ onSelect });
    expect(items(container)[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(items(container)[2]);
    expect(onSelect).toHaveBeenLastCalledWith('R1');
    rerender(<ReqRail rail={RAIL} total={3} selected="R1" onSelect={onSelect} />);
    expect(items(container)[2]).toHaveAttribute('aria-pressed', 'true');
    expect(items(container)[0]).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(items(container)[2]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(items(container)[0]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
