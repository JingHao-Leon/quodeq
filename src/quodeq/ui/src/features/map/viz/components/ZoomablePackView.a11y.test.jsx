/**
 * Accessibility tests for ZoomablePackView.
 * 6355: drill-down and open-file were wired to handleClick only. The pack
 * paints on canvas, so every child of the open folder gets a named, focusable
 * button (ChartKeyboardControls) that reaches the same handler from Enter and
 * Space, beside the overlay's Escape-to-go-up.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { packTree, stubPackCanvas } from '../../../../test-utils/packFixture.js';
import ZoomablePackView from './ZoomablePackView.jsx';
import { t } from '../../../../strings/index.js';

beforeEach(() => { stubPackCanvas(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Activity labels are deterministic: they read the edit count.
const EDITS = new Map([['src/a.py', 2], ['src/ui/b.js', 1], ['docs/c.md', 1]]);

function renderView(props = {}) {
  return render(
    <ZoomablePackView node={packTree()} colorMode="activity" editsByPath={EDITS} onDrillDown={vi.fn()} onFileClick={vi.fn()} {...props} />
  );
}

describe('ZoomablePackView keyboard activation (6355)', () => {
  it('offers one button per child of the open folder, named with its state', () => {
    renderView();
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(expect.arrayContaining(['src, changed 3 times', 'docs, changed once']));
    expect(names.length).toBe(2);
  });

  it('Enter on a folder drills into it', () => {
    const onDrillDown = vi.fn();
    renderView({ onDrillDown });
    fireEvent.keyDown(screen.getByRole('button', { name: 'src, changed 3 times' }), { key: 'Enter' });
    expect(onDrillDown).toHaveBeenCalledWith('src');
  });

  it('Space on a folder drills into it', () => {
    const onDrillDown = vi.fn();
    renderView({ onDrillDown });
    fireEvent.keyDown(screen.getByRole('button', { name: 'docs, changed once' }), { key: ' ' });
    expect(onDrillDown).toHaveBeenCalledWith('docs');
  });

  it('Enter on a file inside its own folder selects it; View details opens it', () => {
    const onFileClick = vi.fn();
    renderView({ onFileClick, currentPath: 'src/ui' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'b.js, changed once' }), { key: 'Enter' });
    expect(onFileClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('map.viewDetails') }));
    expect(onFileClick).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/ui/b.js' }));
  });

  it('concentration buttons read the issue level against the average', () => {
    renderView({ colorMode: 'concentration' });
    for (const b of screen.getAllByRole('button')) {
      expect(b.textContent).toMatch(/, (more|fewer) issues than average$|, about average$/);
    }
  });
});
