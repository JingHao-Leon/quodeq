// src/quodeq/ui/src/features/map/viz/core/skyLayers.test.jsx
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { skyFrame, toPixels, pickBubble, drawSkyStatic, drawSkyOverlay, skyTitleFont } from './skyLayers.js';
import { RING_STYLE } from './skyPaint.js';
import { TAU } from './galaxyCore.js';
import { SKY_RIM } from './skyLayout.js';

const SIZE = 400;
const C = (r, g, b) => ({ r, g, b });
const RINGS = { fixFirst: 0.3, watch: 0.45 };
const PALETTE = { dark: true, bg: C(0, 0, 0), surface: C(9, 9, 9), text: C(255, 255, 255), textMuted: C(120, 120, 120), worse: C(240, 80, 120) };

function scene() {
  const frame = skyFrame(SIZE, SIZE);
  const bubbles = toPixels([{ x: 0, y: 0, r: 0.2 }, { x: 0.5, y: 0, r: 0.1 }], frame);
  const base = { fill: 'rgb(1, 2, 3)', alpha: 0.3, stroke: 'rgb(9, 9, 9)', strokeAlpha: 0.3, ringColor: 'rgb(240, 80, 120)' };
  const paints = [{ ...base, ring: RING_STYLE.DASHED }, { ...base, ring: null }];
  const files = [{ dots: [{ x: 0, y: 0, r: 0.5 }], colors: ['rgb(255, 0, 0)'] }, { dots: [], colors: [] }];
  return { frame, bubbles, paints, files };
}

describe('sky geometry', () => {
  it('maps sky units to pixels around the centre and picks the bubble under the pointer', () => {
    const { bubbles } = scene();
    expect(bubbles[0].px).toBe(SIZE / 2);
    expect(pickBubble(bubbles, SIZE / 2 + 5, SIZE / 2)).toBe(0);
    expect(pickBubble(bubbles, 2, 2)).toBeNull();
  });
});

describe('drawSkyStatic', () => {
  it('draws the backdrop, every bubble, a dashed ring for dormant, and the files inside', () => {
    const ctx = fakeCanvasContext();
    const s = scene();
    drawSkyStatic(ctx, { ...s, rings: RINGS, palette: PALETTE, width: SIZE, height: SIZE });
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('draws the fix-first and watch lines where the layout put them, and the glow follows', () => {
    const ctx = fakeCanvasContext();
    const s = scene();
    drawSkyStatic(ctx, { ...s, rings: RINGS, palette: PALETTE, width: SIZE, height: SIZE });
    const { cx, cy, s: radius } = s.frame;
    expect(ctx.arc).toHaveBeenCalledWith(cx, cy, RINGS.fixFirst * radius, 0, TAU);
    expect(ctx.arc).toHaveBeenCalledWith(cx, cy, RINGS.watch * radius, 0, TAU);
    const stops = ctx.createRadialGradient.mock.results[0].value.addColorStop.mock.calls.map(([at]) => at);
    expect(stops).toEqual(expect.arrayContaining([expect.closeTo(RINGS.fixFirst / SKY_RIM), expect.closeTo(RINGS.watch / SKY_RIM)]));
  });
});

describe('drawSkyOverlay', () => {
  it('one veil with a hole for the kept bubble, then the labels', () => {
    const ctx = fakeCanvasContext();
    const { bubbles } = scene();
    drawSkyOverlay(ctx, { bubbles, keepIndex: 0, hoverIndex: 0, labels: [{ x: 10, y: 10, title: 'article', sub: '3 issues' }], palette: PALETTE, font: 'sans', fontScale: 1, width: SIZE, height: SIZE });
    expect(ctx.rect).toHaveBeenCalledTimes(1);
    expect(ctx.fills).toEqual([{ rule: 'evenodd' }]);
    expect(ctx.fillText).toHaveBeenCalledWith('article', 10, 10);
  });

  it('no veil without a kept bubble', () => {
    const ctx = fakeCanvasContext();
    const { bubbles } = scene();
    drawSkyOverlay(ctx, { bubbles, keepIndex: null, hoverIndex: null, labels: [], palette: PALETTE, font: 'sans', fontScale: 1, width: SIZE, height: SIZE });
    expect(ctx.rect).not.toHaveBeenCalled();
  });
});

describe('skyTitleFont', () => {
  it('scales the title size with the root font, so measuring and drawing agree', () => {
    expect(skyTitleFont('Inter', 2)).toBe('600 23px Inter');
  });
});
