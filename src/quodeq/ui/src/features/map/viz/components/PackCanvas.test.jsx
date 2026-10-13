import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { packTree, stubPackCanvas } from '../../../../test-utils/packFixture.js';
import ZoomablePackView from './ZoomablePackView.jsx';

// The pack paints on two stacked canvases; the pointer goes to the top one.
// hitCircle is stubbed to "the circle at `hitPath`" so each test names what
// the cursor is over instead of computing pixel positions.
let hitPath = null;
vi.mock('../core/packCanvasGeometry.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    hitCircle: (circles) => {
      const i = circles.findIndex((c) => c.depth > 0 && c.data.path === hitPath);
      return i < 0 ? null : i;
    },
  };
});

let ctx;
beforeEach(() => { ctx = stubPackCanvas(); hitPath = null; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function renderAt(currentPath, props = {}) {
  const handlers = { onDrillDown: vi.fn(), onFileClick: vi.fn() };
  const view = render(<ZoomablePackView node={packTree()} currentPath={currentPath} {...handlers} {...props} />);
  const overlay = view.container.querySelector('canvas[tabindex="0"]');
  const clickOn = (path) => { hitPath = path; fireEvent.click(overlay); };
  return { ...view, ...handlers, overlay, clickOn };
}

describe('PackCanvas layers', () => {
  it('stacks a hidden static canvas under a named, focusable overlay', () => {
    const { container, overlay } = renderAt('');
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBe(2);
    expect(canvases[0]).toHaveAttribute('aria-hidden', 'true');
    expect(overlay).toBe(canvases[1]);
    expect(overlay).toHaveAttribute('aria-label');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('paints the circles on the static layer', () => {
    renderAt('');
    expect(ctx.arc).toHaveBeenCalled();
  });
});

describe('PackCanvas selection inside the folder', () => {
  it('a click on a file two levels down drills into its top folder', () => {
    const { clickOn, onDrillDown, onFileClick } = renderAt('');
    clickOn('src/ui/b.js');
    expect(onDrillDown).toHaveBeenCalledWith('src');
    expect(onFileClick).not.toHaveBeenCalled();
  });

  it('a click on a file one level down selects its folder', () => {
    const { clickOn, onDrillDown } = renderAt('src');
    clickOn('src/ui/b.js');
    expect(onDrillDown).toHaveBeenCalledWith('src/ui');
  });

  it('a click on a file inside its own folder opens it', () => {
    const { clickOn, onFileClick } = renderAt('src/ui');
    clickOn('src/ui/b.js');
    expect(onFileClick).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/ui/b.js' }));
  });

  it('a click in the open folder\'s empty space does nothing', () => {
    const { clickOn, onDrillDown, onFileClick } = renderAt('src');
    clickOn('src');
    expect(onDrillDown).not.toHaveBeenCalled();
    expect(onFileClick).not.toHaveBeenCalled();
  });

  it('a click outside the open folder goes to the parent', () => {
    const { clickOn, onDrillDown } = renderAt('src');
    clickOn('docs/c.md');
    expect(onDrillDown).toHaveBeenCalledWith('');
  });

  it('a click outside every circle goes to the parent', () => {
    const { clickOn, onDrillDown } = renderAt('src/ui');
    clickOn(null);
    expect(onDrillDown).toHaveBeenCalledWith('src');
  });
});

describe('PackCanvas hover', () => {
  it('hovering a deep file shows the folder it would select', () => {
    const { container, overlay } = renderAt('');
    hitPath = 'src/ui/b.js';
    fireEvent.mouseMove(overlay);
    expect(overlay.style.cursor).toBe('pointer');
    expect(container.querySelector('.map-tooltip-title')).toHaveTextContent(/^src$/);
  });

  // Values carried over from the SVG-era snapshot: 16 px offset, clamped
  // 180/160 px inside the 300 px fallback container.
  it('clamps the tooltip inside the container margins', () => {
    const { container, overlay } = renderAt('');
    hitPath = 'src';
    fireEvent.mouseMove(overlay, { clientX: 0, clientY: 0 });
    expect(container.querySelector('.map-tooltip')).toHaveStyle({ left: '16px', top: '16px' });
    hitPath = null;
    fireEvent.mouseMove(overlay);
    hitPath = 'src';
    fireEvent.mouseMove(overlay, { clientX: 1000, clientY: 1000 });
    expect(container.querySelector('.map-tooltip')).toHaveStyle({ left: '120px', top: '140px' });
  });

  it('a drill clears the hover until the pointer moves again', () => {
    const { container, overlay, clickOn } = renderAt('');
    hitPath = 'src';
    fireEvent.mouseMove(overlay);
    expect(container.querySelector('.map-tooltip')).not.toBeNull();
    clickOn('src');
    expect(container.querySelector('.map-tooltip')).toBeNull();
    expect(overlay.style.cursor).toBe('default');
  });

  it('hovering the open folder itself selects nothing', () => {
    const { container, overlay } = renderAt('src');
    hitPath = 'src';
    fireEvent.mouseMove(overlay);
    expect(overlay.style.cursor).toBe('default');
    expect(container.querySelector('.map-tooltip')).toBeNull();
  });
});
