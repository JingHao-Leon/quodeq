import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SkyCanvas from './SkyCanvas.jsx';
import { stubPackCanvas } from '../../../../test-utils/packFixture.js';
import { readMapPalette } from '../core/mapPalette.js';
import { AREA_KIND } from '../../mapVocab.js';

vi.mock('../core/mapPalette.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, readMapPalette: vi.fn(real.readMapPalette) };
});

const area = (name, density, kind) => ({
  name, density, kind, touchedShare: 0, layers: [],
  dots: [{ path: `${name}/a`, stats: { violations: 1, compliance: 2, weight: 1, files: 1, critical: 0, major: 0 }, checks: 3 }],
  stats: { violations: 1, compliance: 3, weight: 1, files: 6, critical: 0, major: 0 },
});
const AREAS = [area('article', 0.9, AREA_KIND.HOTSPOT), area('search', 0.2, AREA_KIND.HEALTHY)];
const LABEL = (a) => ({ title: a.name, sub: '1 issue' });

let ctx;
beforeEach(() => { ctx = stubPackCanvas(); vi.mocked(readMapPalette).mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function sky(props = {}) {
  return <SkyCanvas areas={AREAS} average={1} dark showLabels selected={null} onSelect={vi.fn()} onHover={vi.fn()} labelText={LABEL} {...props} />;
}

describe('SkyCanvas', () => {
  it('one keyboard button per area, most need first', () => {
    render(sky());
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('article');
  });

  it('paints bubbles on the static layer', () => {
    render(sky());
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('activating an area selects it, flagged as a keyboard choice; Escape clears the selection', () => {
    const onSelect = vi.fn();
    render(sky({ selected: 0, onSelect }));
    fireEvent.click(screen.getAllByRole('button')[1]);
    expect(onSelect).toHaveBeenCalledWith(1, true);
    fireEvent.keyDown(screen.getByLabelText(/risk/i), { key: 'Escape' });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('a theme flip re-reads the palette', () => {
    const { rerender } = render(sky({ dark: false }));
    expect(readMapPalette).toHaveBeenLastCalledWith(expect.anything(), expect.any(Function), false);
    rerender(sky({ dark: true }));
    expect(readMapPalette).toHaveBeenLastCalledWith(expect.anything(), expect.any(Function), true);
  });

  it('survives fewer areas after a hover', () => {
    const { rerender, container } = render(sky());
    fireEvent.mouseMove(container.querySelector('canvas[tabindex="0"]'), { clientX: 1, clientY: 1 });
    expect(() => rerender(sky({ areas: AREAS.slice(0, 1) }))).not.toThrow();
  });
});
