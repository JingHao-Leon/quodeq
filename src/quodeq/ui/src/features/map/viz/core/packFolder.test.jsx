import { describe, it, expect, vi } from 'vitest';
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { drawFolderGlow, drawFolder } from './packFolder.js';

const RED = { r: 240, g: 80, b: 120 };
const AT = { px: 50, py: 60 };

describe('drawFolderGlow', () => {
  it('strokes the rim with a shadow in the folder hue, wider for a stronger glow', () => {
    const blurs = [0.3, 1].map((glow) => {
      const ctx = fakeCanvasContext();
      drawFolderGlow(ctx, AT, 20, { glow, hue: RED });
      expect(ctx.stroke).toHaveBeenCalledTimes(1);
      expect(ctx.shadowColor).toMatch(/^rgba\(240, 80, 120, /);
      return ctx.shadowBlur;
    });
    expect(blurs[0]).toBeLessThan(blurs[1]);
  });

  it('draws nothing without glow, without a hue, or while the folder fades in', () => {
    for (const paint of [{ glow: 0, hue: RED }, { glow: 0.5 }, { glow: 0.5, hue: RED, arriving: true }]) {
      const ctx = fakeCanvasContext();
      drawFolderGlow(ctx, AT, 20, paint);
      expect(ctx.stroke).not.toHaveBeenCalled();
    }
  });

  it('scales the blur by the device-pixel ratio and restores the context', () => {
    const ctx = { ...fakeCanvasContext(), getTransform: () => ({ a: 2 }) };
    drawFolderGlow(ctx, AT, 20, { glow: 1, hue: RED });
    const plain = fakeCanvasContext();
    drawFolderGlow(plain, AT, 20, { glow: 1, hue: RED });
    expect(ctx.shadowBlur).toBe(plain.shadowBlur * 2);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
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
