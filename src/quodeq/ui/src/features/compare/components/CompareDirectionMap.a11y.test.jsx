import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import CompareDirectionMap from './CompareDirectionMap.jsx';

const row = (over) => ({
  id: over.name, name: over.name, score: 7, delta: null, totalFiles: 100, analyzedFiles: null,
  totalViolations: 20, totalCompliance: 80, severity: {}, lastISO: '2026-10-01T00:00:00Z',
  stale: false, remote: false, source: 'local', dims: [], ...over,
});
const ROWS = [
  row({ name: 'alpha', score: 8.5, delta: 0.6, totalFiles: 900 }),
  row({ name: 'beta', score: 6.5, delta: -0.4 }),
];

function renderMap(over = {}) {
  const props = { rows: ROWS, fleetScore: 7.5, hover: null, setHover: vi.fn(), onOpenProject: vi.fn(), ...over };
  render(<CompareDirectionMap {...props} />);
  return props;
}

describe('CompareDirectionMap keyboard access', () => {
  it('every point is a named button in the tab order', async () => {
    renderMap();
    const points = screen.getAllByRole('button');
    expect(points).toHaveLength(2);
    expect(screen.getByRole('button', { name: /^alpha: 8\.5/ })).toHaveAttribute('tabindex', '0');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /^alpha/ })).toHaveFocus();
  });

  it('focus lights the project up like hover does', async () => {
    const { setHover } = renderMap();
    await userEvent.tab();
    expect(setHover).toHaveBeenLastCalledWith('alpha');
    await userEvent.tab();
    expect(setHover).toHaveBeenCalledWith(null);
    expect(setHover).toHaveBeenLastCalledWith('beta');
  });

  it('Enter and Space open the focused project, like a click', async () => {
    const { onOpenProject } = renderMap();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onOpenProject).toHaveBeenLastCalledWith('alpha');
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(onOpenProject).toHaveBeenLastCalledWith('beta');
    expect(onOpenProject).toHaveBeenCalledTimes(2);
  });
});
