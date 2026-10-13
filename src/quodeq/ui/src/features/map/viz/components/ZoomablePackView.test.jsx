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
