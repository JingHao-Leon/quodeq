import { describe, it, expect } from 'vitest';
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { drawFolderGlow } from './packFolder.js';

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
