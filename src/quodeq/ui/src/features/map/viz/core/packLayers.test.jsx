import { describe, it, expect } from 'vitest';
import { hierarchy } from 'd3-hierarchy';
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { drawStatic, drawOverlay } from './packLayers.js';

const VIEWPORT = { scale: 1, ox: 0, oy: 0 };
const SIZE = 600;
const indexOf = (circles) => new Map(circles.map((c, i) => [c, i]));

function scene() {
  const root = hierarchy({ name: '', children: [{ name: 'src', path: 'src', children: [{ name: 'a.py', path: 'src/a.py' }, { name: 'sub', path: 'src/sub', children: [{ name: 'b.py', path: 'src/sub/b.py' }] }] }] });
  const circles = root.descendants();
  const geometry = [[300, 300, 300], [300, 300, 200], [250, 300, 40], [380, 300, 80], [380, 300, 40]];
  const screenCoords = geometry.map(([cx, cy, r]) => ({ cx, cy, r }));
  const plain = { fill: 'rgb(1, 2, 3)', alpha: 1, stroke: 'rgb(9, 9, 9)', strokeAlpha: 0.22, cutOut: true, file: false, outlineOnly: false };
  const paint = circles.map((c) => ({ ...plain, file: !c.children }));
  return { circles, screenCoords, paint };
}

describe('drawStatic', () => {
  it('draws every visible circle and cuts sub-folders out of solid folders', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    const drawn = drawStatic(ctx, { circles, screenCoords, viewport: VIEWPORT, paint, index: indexOf(circles), width: SIZE, height: SIZE });
    expect(drawn).toBe(circles.length);
    // root, src, a.py, sub, b.py: solid folders fill even-odd, files plain.
    const EO = { rule: 'evenodd' };
    const PLAIN = { rule: undefined };
    expect(ctx.fills).toEqual([EO, EO, PLAIN, EO, PLAIN]);
    // One cut-out each: src out of the root, sub out of src.
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
  });

  it('leaves globalAlpha back at 1', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    const faint = paint.map((p) => ({ ...p, alpha: 0.3, strokeAlpha: 0.22 }));
    drawStatic(ctx, { circles, screenCoords, viewport: VIEWPORT, paint: faint, index: indexOf(circles), width: SIZE, height: SIZE });
    expect(ctx.globalAlpha).toBe(1);
  });

  it('glass folders are translucent fills without cut-outs', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    const glass = paint.map((p) => ({ ...p, cutOut: false, alpha: p.file ? 1 : 0.3 }));
    drawStatic(ctx, { circles, screenCoords, viewport: VIEWPORT, paint: glass, index: indexOf(circles), width: SIZE, height: SIZE });
    expect(ctx.fills.every((f) => f.rule !== 'evenodd')).toBe(true);
  });
});

describe('drawOverlay', () => {
  const palette = { dark: true, bg: { r: 0, g: 0, b: 0 }, text: { r: 255, g: 255, b: 255 } };

  it('one veil with a hole for the kept circle', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords } = scene();
    drawOverlay(ctx, { circles, screenCoords, viewport: VIEWPORT, keepIndex: 1, hoverIndex: null, focusNode: circles[0], showLabels: false, palette, font: 'sans', width: SIZE, height: SIZE });
    expect(ctx.rect).toHaveBeenCalledTimes(1);
    expect(ctx.fills).toEqual([{ rule: 'evenodd' }]);
  });

  it('no veil at the root, labels show the last segment of focus children', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords } = scene();
    circles[1].data.name = 'app/src';
    drawOverlay(ctx, { circles, screenCoords, viewport: VIEWPORT, keepIndex: null, hoverIndex: null, focusNode: circles[0], showLabels: true, palette, font: 'sans', width: SIZE, height: SIZE });
    expect(ctx.rect).not.toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('src', expect.any(Number), expect.any(Number));
  });
});

describe('drawOverlay labels', () => {
  const palette = { dark: true, bg: { r: 0, g: 0, b: 0 }, text: { r: 255, g: 255, b: 255 } };

  it('two overlapping small siblings keep only the larger label', () => {
    const ctx = fakeCanvasContext();
    const root = hierarchy({ name: '', children: [{ name: 'y.py', path: 'y.py' }, { name: 'x.py', path: 'x.py' }] });
    const circles = root.descendants();
    const screenCoords = [[300, 300, 100], [305, 300, 15], [300, 300, 20]].map(([cx, cy, r]) => ({ cx, cy, r }));
    drawOverlay(ctx, { circles, screenCoords, viewport: VIEWPORT, keepIndex: null, hoverIndex: null, focusNode: circles[0], showLabels: true, palette, font: 'sans', width: SIZE, height: SIZE });
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toEqual(['x.py']);
  });
});
