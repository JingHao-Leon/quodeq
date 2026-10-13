import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { packTree, stubPackCanvas } from '../../../../test-utils/packFixture.js';
import { readMapPalette } from '../core/mapPalette.js';
import ZoomablePackView from './ZoomablePackView.jsx';

vi.mock('../core/mapPalette.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, readMapPalette: vi.fn(real.readMapPalette) };
});

let ctx;
beforeEach(() => { ctx = stubPackCanvas(); vi.mocked(readMapPalette).mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const overlayOf = (container) => container.querySelector('canvas[tabindex="0"]');

describe('ZoomablePackView container Escape key (#1907)', () => {
  it('Escape zooms out to the parent path', () => {
    const onDrillDown = vi.fn();
    const { container } = render(<ZoomablePackView node={packTree()} currentPath="src/ui" onDrillDown={onDrillDown} />);
    fireEvent.keyDown(overlayOf(container), { key: 'Escape' });
    expect(onDrillDown).toHaveBeenCalledWith('src');
  });

  it('the overlay carries the viz-focusable class (suppresses stray focus ring)', () => {
    const { container } = render(<ZoomablePackView node={packTree()} />);
    expect(overlayOf(container)).toHaveClass('viz-focusable');
  });
});

// Labels belong to the children of the focused node. A colour-mode switch
// must keep the focus (and its labels) where it was.
describe('ZoomablePackView focus across colour modes', () => {
  const labels = () => ctx.fillText.mock.calls.map((call) => call[0]);

  it('keeps the focused folder and its labels after a colour-mode switch', () => {
    const { rerender } = render(<ZoomablePackView node={packTree()} colorMode="concentration" currentPath="src/ui" />);
    expect(new Set(labels())).toEqual(new Set(['b.js']));
    ctx.fillText.mockClear();
    rerender(<ZoomablePackView node={packTree()} colorMode="activity" currentPath="src/ui" />);
    expect(new Set(labels())).toEqual(new Set(['b.js']));
  });
});

describe('ZoomablePackView theme', () => {
  it('re-reads the palette when the theme flips to dark', () => {
    const tree = packTree();
    const { rerender } = render(<ZoomablePackView node={tree} dark={false} />);
    expect(readMapPalette).toHaveBeenLastCalledWith(expect.anything(), expect.any(Function), false);
    rerender(<ZoomablePackView node={tree} dark />);
    expect(readMapPalette).toHaveBeenLastCalledWith(expect.anything(), expect.any(Function), true);
  });
});

// A wrapper folder that holds nearly every file: the pack opens inside it,
// once per visit (resetKey), so a way back to the root stays at the root.
describe('ZoomablePackView opens inside a dominant folder', () => {
  const file = (path) => ({ path, name: path.split('/').at(-1), isFile: true, violations: 1, compliance: 1, severity: { minor: 1 } });
  const dominantTree = () => {
    const files = Array.from({ length: 9 }, (_, i) => file(`app/f${i}.js`));
    const app = { path: 'app', name: 'app', isFile: false, violations: 9, compliance: 9, severity: {}, children: files };
    return { path: '', name: '', isFile: false, violations: 10, compliance: 10, severity: {}, children: [app, file('README.md')] };
  };

  it('drills into the folder once, and not again at the root', () => {
    const onDrillDown = vi.fn();
    const tree = dominantTree();
    const { rerender } = render(<ZoomablePackView node={tree} currentPath="" onDrillDown={onDrillDown} />);
    rerender(<ZoomablePackView node={tree} currentPath="app" onDrillDown={onDrillDown} />);
    rerender(<ZoomablePackView node={tree} currentPath="" onDrillDown={onDrillDown} />);
    expect(onDrillDown).toHaveBeenCalledTimes(1);
    expect(onDrillDown).toHaveBeenCalledWith('app');
  });

  it('stays at the root when auto-open is off (an explicit jump there)', () => {
    const onDrillDown = vi.fn();
    render(<ZoomablePackView node={dominantTree()} currentPath="" autoOpen={false} onDrillDown={onDrillDown} />);
    expect(onDrillDown).not.toHaveBeenCalled();
  });

  it('opens again for a new resetKey', () => {
    const onDrillDown = vi.fn();
    const tree = dominantTree();
    const { rerender } = render(<ZoomablePackView node={tree} resetKey={1} onDrillDown={onDrillDown} />);
    rerender(<ZoomablePackView node={tree} resetKey={2} onDrillDown={onDrillDown} />);
    expect(onDrillDown).toHaveBeenCalledTimes(2);
  });
});
