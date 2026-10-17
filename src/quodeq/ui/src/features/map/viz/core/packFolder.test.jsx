import { describe, it, expect, vi } from 'vitest';
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { drawFolderGlow, drawFolder } from './packFolder.js';

const RED = { r: 240, g: 80, b: 120 };
const AT = { px: 50, py: 60 };

describe('drawFolderGlow', () => {
  const strokes = (glow, extra = {}, r = 20) => {
    const ctx = fakeCanvasContext();
    const widths = [];
    ctx.stroke.mockImplementation(() => widths.push(ctx.lineWidth));
    drawFolderGlow(ctx, AT, r, { glow, hue: RED, ...extra });
    return { ctx, widths };
  };

  it('strokes soft rings in the folder hue, widest first, wider for a stronger glow', () => {
    const weak = strokes(0.3);
    const strong = strokes(1);
    expect(strong.widths[0]).toBeGreaterThan(strong.widths[1]);
    expect(strong.widths[0]).toBeGreaterThan(weak.widths[0]);
    expect(strong.ctx.strokeStyle.startsWith('rgba(240, 80, 120, ')).toBe(true);
  });

  it('uses no blur and leaves the alpha at 1', () => {
    const { ctx } = strokes(1);
    expect([ctx.shadowBlur, ctx.globalAlpha]).toEqual([0, 1]);
  });

  it('a worse and a better folder each take their own rim tone', () => {
    const rim = (badness) => strokes(1, { badness }).ctx.strokeStyle;
    expect(rim(0.8)).not.toBe(rim(-0.8));
  });

  it('keeps the glow inside the circle: no stroke reaches past the rim', () => {
    const ctx = fakeCanvasContext();
    const outer = [];
    ctx.stroke.mockImplementation(() => outer.push(ctx.arc.mock.calls.at(-1)[2] + ctx.lineWidth / 2));
    drawFolderGlow(ctx, AT, 20, { glow: 1, hue: RED, badness: 0.8 });
    expect(Math.max(...outer)).toBeLessThanOrEqual(20 + 0.5);
  });

  it('a small folder\'s glow reaches a quarter of its radius at most, a big one\'s the full reach', () => {
    const widest = (r) => strokes(1, { badness: 0.8 }, r).widths[0];
    expect(widest(20)).toBeCloseTo(5);
    expect(widest(200)).toBe(widest(400));
  });

  it('draws nothing without glow, without a hue, while the folder fades in, or when it is too small to see', () => {
    for (const [glow, extra, r] of [[0, {}, 20], [0.5, { hue: undefined }, 20], [0.5, { arriving: true }, 20], [1, {}, 3]]) {
      expect(strokes(glow, extra, r).ctx.stroke).not.toHaveBeenCalled();
    }
  });
});

describe('drawFolder', () => {
  const child = { children: [{ children: [] }] };
  const parent = { children: [child] };
  const index = new Map([[parent, 0], [child, 1]]);
  const at = (i) => (i === 0 ? { px: 50, py: 50, r: 40 } : { px: 50, py: 50, r: 10 });
  const glass = { fill: 'rgb(240, 80, 120)', alpha: 0.4, stroke: 'rgb(1, 1, 1)', strokeAlpha: 0.2, cutOut: true };
  const fillAlphas = (paint) => {
    const ctx = fakeCanvasContext();
    const alphas = [];
    ctx.fill = vi.fn(() => alphas.push(ctx.globalAlpha));
    drawFolder(ctx, { c: parent, p: at(0), paint, at, index, paints: [paint, { ...glass }] });
    return alphas;
  };

  it('keeps holeShare of its tint under a cut-out sub-folder', () => {
    expect(fillAlphas({ ...glass, holeShare: 0.35 })).toEqual([0.4, 0.4 * 0.35]);
  });

  it('leaves the sub-folders clear without a holeShare', () => {
    expect(fillAlphas(glass)).toEqual([0.4]);
  });
});
