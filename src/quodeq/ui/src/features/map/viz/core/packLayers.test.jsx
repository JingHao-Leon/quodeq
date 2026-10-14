import { describe, it, expect } from 'vitest';
import { hierarchy } from 'd3-hierarchy';
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { drawStatic, drawOverlay, fadesFor, strokeGhostCircle, FADE, GHOST_DASH_PX, GHOST_STROKE_ALPHA } from './packLayers.js';

const VIEWPORT = { scale: 1, ox: 0, oy: 0 };
const SIZE = 600;
const indexOf = (circles) => new Map(circles.map((c, i) => [c, i]));
/** drawStatic over the whole fixture canvas with an identity viewport. */
const drawAll = (ctx, { circles, screenCoords, paint }) => drawStatic(ctx, { circles, screenCoords, viewport: VIEWPORT, paint, index: indexOf(circles), width: SIZE, height: SIZE });

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
    const drawn = drawAll(ctx, { circles, screenCoords, paint });
    expect(drawn).toBe(circles.length);
    // root, src, a.py, sub, b.py: solid folders fill even-odd, files plain.
    const EO = { rule: 'evenodd' };
    const PLAIN = { rule: undefined };
    expect(ctx.fills).toEqual([EO, EO, PLAIN, EO, PLAIN]);
    // One cut-out each: src out of the root, sub out of src.
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
  });

  it('never cuts a ghost (absent) sub-folder out of its parent, so absence is no brighter than presence', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    paint[3] = { ghost: true, file: false, stroke: 'rgb(9, 9, 9)', strokeAlpha: 0.4 };
    drawAll(ctx, { circles, screenCoords, paint });
    // Only src is cut out of the root; src stays whole under its ghost sub-folder.
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
  });

  it('never cuts a sub-folder that is still fading in out of its parent, so its slot never shows the page', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    paint[3] = { ...paint[3], alpha: 0.5, arriving: true };
    drawAll(ctx, { circles, screenCoords, paint });
    // Only src is cut out of the root; src stays whole under its arriving sub-folder.
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
  });

  it('draws the fading dotted ring an arriving circle carries, under its fill', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    paint[2] = { ...paint[2], alpha: 0.4, ghostRing: { ghost: true, file: true, stroke: 'rgb(9, 9, 9)', strokeAlpha: 0.3 } };
    drawAll(ctx, { circles, screenCoords, paint });
    expect(ctx.setLineDash).toHaveBeenCalledWith([GHOST_DASH_PX, GHOST_DASH_PX]);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('leaves globalAlpha back at 1', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    const faint = paint.map((p) => ({ ...p, alpha: 0.3, strokeAlpha: 0.22 }));
    drawAll(ctx, { circles, screenCoords, paint: faint });
    expect(ctx.globalAlpha).toBe(1);
  });

  it('fills a file at its paint\'s opacity, so an arriving file can fade in', () => {
    const ctx = fakeCanvasContext();
    const alphas = [];
    ctx.fill = () => alphas.push(ctx.globalAlpha);
    const { circles, screenCoords, paint } = scene();
    paint[2] = { ...paint[2], alpha: 0.25 };
    drawAll(ctx, { circles, screenCoords, paint });
    expect(alphas[2]).toBe(0.25);
    expect(alphas[4]).toBe(1);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('glass folders are translucent fills without cut-outs', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    const glass = paint.map((p) => ({ ...p, cutOut: false, alpha: p.file ? 1 : 0.3 }));
    drawAll(ctx, { circles, screenCoords, paint: glass });
    expect(ctx.fills.every((f) => f.rule !== 'evenodd')).toBe(true);
  });

  it('draws a ghost (absent) circle as a dotted outline and skips circles without paint', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    paint[2] = { ghost: true, file: true, stroke: 'rgb(9, 9, 9)', strokeAlpha: 0.4 };
    paint[4] = null;
    const drawn = drawAll(ctx, { circles, screenCoords, paint });
    expect(drawn).toBe(circles.length - 1);
    expect(ctx.setLineDash).toHaveBeenCalledWith([GHOST_DASH_PX, GHOST_DASH_PX]);
    expect(ctx.fills).toHaveLength(3);
  });
});

describe('strokeGhostCircle', () => {
  it('strokes a dotted circle and leaves the dash and alpha reset', () => {
    const ctx = fakeCanvasContext();
    strokeGhostCircle(ctx, { px: 10, py: 20, r: 5 }, { stroke: 'rgb(1, 1, 1)', strokeAlpha: GHOST_STROKE_ALPHA }, 2);
    expect(ctx.arc).toHaveBeenCalledWith(10, 20, 5, 0, expect.any(Number));
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect([ctx.lineWidth, ctx.globalAlpha, ctx.setLineDash.mock.calls.at(-1)[0]]).toEqual([2, 1, []]);
  });
});

describe('drawOverlay', () => {
  const palette = { dark: true, bg: { r: 0, g: 0, b: 0 }, text: { r: 255, g: 255, b: 255 } };
  const overlay = (ctx, { circles, screenCoords }, over = {}) => drawOverlay(ctx, {
    circles, screenCoords, viewport: VIEWPORT, hoverIndex: null, focusNode: circles[0], showLabels: true, palette, font: 'sans', width: SIZE, height: SIZE, ...over,
  });
  const texts = (ctx) => ctx.fillText.mock.calls.map((c) => c[0]);

  it('draws no veil: a hover is its ring and its name', () => {
    const ctx = fakeCanvasContext();
    overlay(ctx, scene(), { hoverIndex: 1 });
    expect(ctx.rect).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(texts(ctx)).toEqual(['src']);
  });

  it('labels show the last segment of the open folder\'s sub-folders, never a file', () => {
    const ctx = fakeCanvasContext();
    const s = scene();
    s.circles[3].data.name = 'lib/sub';
    overlay(ctx, s, { focusNode: s.circles[1] });
    expect(texts(ctx)).toContain('sub');
    expect(texts(ctx)).not.toContain('a.py');
  });

  it('the open folder keeps its name on top, inside the canvas when its top is off screen', () => {
    const ctx = fakeCanvasContext();
    const s = scene();
    s.screenCoords[1] = { cx: 300, cy: 300, r: 1000 };
    overlay(ctx, s, { focusNode: s.circles[1] });
    const [, , y] = ctx.fillText.mock.calls.find(([text]) => text === 'src');
    expect(y).toBeGreaterThan(0);
  });

  it('labels off: no names at all, not even the hovered folder\'s', () => {
    const ctx = fakeCanvasContext();
    overlay(ctx, scene(), { hoverIndex: 1, showLabels: false });
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});

describe('drawOverlay labels', () => {
  const palette = { dark: true, bg: { r: 0, g: 0, b: 0 }, text: { r: 255, g: 255, b: 255 } };
  const folder = (name) => ({ name, path: name, children: [{ name: `${name}.py`, path: `${name}/${name}.py` }] });

  it('two overlapping small sibling folders keep only the larger label', () => {
    const ctx = fakeCanvasContext();
    const root = hierarchy({ name: '', children: [folder('y'), folder('x')] });
    const circles = root.descendants();
    const screenCoords = [[300, 300, 100], [305, 300, 15], [300, 300, 20], [305, 300, 5], [300, 300, 5]].map(([cx, cy, r]) => ({ cx, cy, r }));
    drawOverlay(ctx, { circles, screenCoords, viewport: VIEWPORT, hoverIndex: null, focusNode: circles[0], showLabels: true, palette, font: 'sans', width: SIZE, height: SIZE });
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toEqual(['x']);
  });

  it('a larger fontScale yields a larger label font', () => {
    const fontAt = (fontScale) => {
      const ctx = fakeCanvasContext();
      const root = hierarchy({ name: '', children: [folder('x')] });
      const circles = root.descendants();
      const screenCoords = [[300, 300, 300], [300, 300, 200], [300, 300, 100]].map(([cx, cy, r]) => ({ cx, cy, r }));
      drawOverlay(ctx, { circles, screenCoords, viewport: VIEWPORT, hoverIndex: null, focusNode: circles[0], showLabels: true, palette, font: 'sans', width: SIZE, height: SIZE, fontScale });
      return parseFloat(ctx.font.split(' ')[1]);
    };
    expect(fontAt(1.5)).toBeCloseTo(fontAt(1) * 1.5);
  });
});

describe('fadesFor', () => {
  // scene(): 0 root, 1 src, 2 src/a.py, 3 src/sub, 4 src/sub/b.py
  const fades = (over) => { const { circles } = scene(); return Array.from(fadesFor(circles, indexOf(circles), over(circles)), (v) => Math.round(v * 100) / 100); };

  it('at the root everything is active', () => {
    expect(fades(() => ({}))).toEqual(Array(5).fill(FADE.ACTIVE));
  });

  it('inside a folder, what is outside it is context', () => {
    expect(fades((c) => ({ focusNode: c[3] }))).toEqual([FADE.CONTEXT, FADE.CONTEXT, FADE.CONTEXT, FADE.ACTIVE, FADE.ACTIVE]);
  });

  it('hovering a folder above the open one previews it and steps the open folder back', () => {
    expect(fades((c) => ({ focusNode: c[3], hoverNode: c[1] }))).toEqual([FADE.CONTEXT, FADE.ACTIVE, FADE.ACTIVE, FADE.RECEDED, FADE.RECEDED]);
  });

  it('hovering inside the open folder changes nothing', () => {
    expect(fades((c) => ({ focusNode: c[1], hoverNode: c[3] }))).toEqual(fades((c) => ({ focusNode: c[1] })));
  });

  it('a selected file steps the rest of the open folder back', () => {
    expect(fades((c) => ({ focusNode: c[1], selectedNode: c[2] }))).toEqual([FADE.CONTEXT, FADE.ACTIVE, FADE.ACTIVE, FADE.RECEDED, FADE.RECEDED]);
  });
});

describe('drawStatic fades', () => {
  it('draws each circle at its fade', () => {
    const ctx = fakeCanvasContext();
    const { circles, screenCoords, paint } = scene();
    const alphas = [];
    Object.defineProperty(ctx, 'globalAlpha', { set: (v) => alphas.push(v), get: () => 1 });
    drawStatic(ctx, { circles, screenCoords, viewport: VIEWPORT, paint, index: indexOf(circles), width: SIZE, height: SIZE, fades: Float32Array.from([1, 1, FADE.CONTEXT, 1, 1]) });
    expect(alphas.some((v) => Math.abs(v - FADE.CONTEXT) < 1e-6)).toBe(true);
  });
});
