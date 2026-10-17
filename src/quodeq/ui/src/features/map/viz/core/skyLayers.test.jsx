// src/quodeq/ui/src/features/map/viz/core/skyLayers.test.jsx
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { skyFrame, toPixels, pickBubble, drawSkyStatic, drawSkyOverlay, skyTitleFont, skyZoneFont, placeZoneLabels } from './skyLayers.js';
import { RING_STYLE } from './skyPaint.js';
import { TAU } from './galaxyCore.js';
import { SKY_ZONE } from '../../mapVocab.js';

const SIZE = 400;
const C = (r, g, b) => ({ r, g, b });
const RINGS = { fixFirst: 0.3, watch: 0.45 };
const PALETTE = {
  dark: true, bg: C(0, 0, 0), surface: C(9, 9, 9), text: C(255, 255, 255), textMuted: C(120, 120, 120), worse: C(240, 80, 120),
  sevCritical: C(250, 60, 60), sevMajor: C(250, 160, 40),
};
const ZONE_TEXT = { [SKY_ZONE.FIX_FIRST]: { text: 'Fix first · 2', w: 60 }, [SKY_ZONE.WATCH]: { text: 'Watch · 3', w: 50 } };

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

  it('never picks a bubble of radius 0 (an area the run shown does not have)', () => {
    const frame = skyFrame(SIZE, SIZE);
    expect(pickBubble(toPixels([{ x: 0, y: 0, r: 0 }], frame), SIZE / 2, SIZE / 2)).toBeNull();
  });
});

describe('drawSkyStatic', () => {
  const draw = (extra = {}) => {
    const ctx = fakeCanvasContext();
    const s = scene();
    drawSkyStatic(ctx, { ...s, rings: RINGS, palette: PALETTE, width: SIZE, height: SIZE, ...extra });
    return { ctx, frame: s.frame };
  };

  it('draws the zones, every bubble and a dashed ring for dormant, but no file dots (they show on hover)', () => {
    const ctx = fakeCanvasContext();
    const styles = [];
    ctx.fill.mockImplementation(() => { styles.push(ctx.fillStyle); });
    drawSkyStatic(ctx, { ...scene(), rings: RINGS, palette: PALETTE, width: SIZE, height: SIZE });
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(2);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
    expect(ctx.globalAlpha).toBe(1);
    expect(styles).not.toContain('rgb(255, 0, 0)');
  });

  it('draws the fix-first and watch lines where the layout put them, and each zone glows inside its own ring', () => {
    const { ctx, frame } = draw();
    const { cx, cy, s: radius } = frame;
    expect(ctx.arc).toHaveBeenCalledWith(cx, cy, RINGS.fixFirst * radius, 0, TAU);
    expect(ctx.arc).toHaveBeenCalledWith(cx, cy, RINGS.watch * radius, 0, TAU);
    // The watch haze spans the band between the rings, the fix-first core the circle inside.
    expect(ctx.createRadialGradient).toHaveBeenCalledWith(cx, cy, RINGS.fixFirst * radius, cx, cy, RINGS.watch * radius);
    expect(ctx.createRadialGradient).toHaveBeenCalledWith(cx, cy, 0, cx, cy, RINGS.fixFirst * radius);
  });

  it('only the fix-first line glows', () => {
    const ctx = fakeCanvasContext();
    const blurs = [];
    ctx.stroke.mockImplementation(() => { blurs.push(ctx.shadowBlur); });
    drawSkyStatic(ctx, { ...scene(), rings: RINGS, palette: PALETTE, width: SIZE, height: SIZE });
    // Rim, watch, fix first: the first three strokes.
    expect(blurs.slice(0, 3).map((b) => b > 0)).toEqual([false, false, true]);
    expect(ctx.shadowBlur).toBe(0);
  });

  it('writes each zone\'s label on top of its ring, and none without zone labels', () => {
    const { frame } = scene();
    const zoneLabels = placeZoneLabels(frame, RINGS, ZONE_TEXT, 1);
    const { ctx } = draw({ zoneLabels, font: 'sans', fontScale: 1 });
    expect(ctx.fillText).toHaveBeenCalledWith('Fix first · 2', zoneLabels[0].x, zoneLabels[0].y);
    expect(ctx.fillText).toHaveBeenCalledWith('Watch · 3', zoneLabels[1].x, zoneLabels[1].y);
    expect(draw({ zoneLabels: [] }).ctx.fillText).not.toHaveBeenCalled();
  });
});

describe('placeZoneLabels', () => {
  it('centres each label above its ring, with a box the area labels keep clear of', () => {
    const frame = skyFrame(SIZE, SIZE);
    const [fix, watch] = placeZoneLabels(frame, RINGS, ZONE_TEXT, 1);
    expect([fix.zone, watch.zone]).toEqual([SKY_ZONE.FIX_FIRST, SKY_ZONE.WATCH]);
    expect(fix.x).toBe(frame.cx);
    expect(fix.y).toBeLessThan(frame.cy - RINGS.fixFirst * frame.s);
    expect(watch.y).toBeLessThan(fix.y);
    expect(fix.box.x1 - fix.box.x0).toBe(ZONE_TEXT[SKY_ZONE.FIX_FIRST].w);
    expect(fix.box.y1).toBe(fix.y);
  });
});

describe('drawSkyOverlay', () => {
  it('one veil with a hole for the kept bubble, then the labels', () => {
    const ctx = fakeCanvasContext();
    const { bubbles } = scene();
    drawSkyOverlay(ctx, { bubbles, keepIndex: 0, hoverIndex: 0, labels: [{ x: 10, y: 10, title: 'article' }], palette: PALETTE, font: 'sans', fontScale: 1, width: SIZE, height: SIZE });
    expect(ctx.rect).toHaveBeenCalledTimes(1);
    expect(ctx.fills).toEqual([{ rule: 'evenodd' }]);
    expect(ctx.fillText).toHaveBeenCalledWith('article', 10, 10);
  });

  it('draws the kept bubble\'s file dots', () => {
    const ctx = fakeCanvasContext();
    const { bubbles } = scene();
    const files = bubbles.map(() => ({ dots: [{ x: 0, y: 0, r: 0.3 }], colors: ['rgb(1, 2, 3)'] }));
    drawSkyOverlay(ctx, { bubbles, files, keepIndex: 0, hoverIndex: null, labels: [], palette: PALETTE, font: 'sans', fontScale: 1, width: SIZE, height: SIZE });
    expect(ctx.fills).toHaveLength(2);
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
    expect(skyZoneFont('Inter', 2)).toBe('600 20px Inter');
  });
});
