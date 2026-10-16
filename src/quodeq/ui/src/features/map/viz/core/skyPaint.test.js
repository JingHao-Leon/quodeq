import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyAreaPaint, fileDotColor, worstOfStats, RING_STYLE } from './skyPaint.js';
import { badness } from './mapBadness.js';
import { fileSeverityColor, rgbCss } from './mapPaint.js';
import { AREA_KIND, NODE_KIND } from '../../mapVocab.js';

const C = (r, g, b) => ({ r, g, b });
const PALETTE = {
  bg: C(10, 10, 10), surfaceAlt: C(20, 20, 20), text: C(230, 230, 230), worse: C(240, 80, 120),
  better: C(0, 212, 255), neutral: C(138, 143, 168),
};
const area = (kind, stats) => ({ kind, stats: { violations: 0, compliance: 0, weight: 0, files: 5, critical: 0, major: 0, ...stats } });

test('rings: hotspot solid, dormant dashed, others none', () => {
  const dark = { ...PALETTE, dark: true };
  assert.equal(skyAreaPaint(area(AREA_KIND.HOTSPOT, {}), 1, dark).ring, RING_STYLE.SOLID);
  assert.equal(skyAreaPaint(area(AREA_KIND.DORMANT, {}), 1, dark).ring, RING_STYLE.DASHED);
  assert.equal(skyAreaPaint(area(AREA_KIND.WATCH, {}), 1, dark).ring, null);
});

test('a heavy area takes the worse hue: glass in dark, solid in light', () => {
  const heavy = area(AREA_KIND.HOTSPOT, { violations: 20, compliance: 2, weight: 40, critical: 2 });
  const dark = skyAreaPaint(heavy, 1, { ...PALETTE, dark: true });
  const light = skyAreaPaint(heavy, 1, { ...PALETTE, dark: false });
  assert.equal(dark.fill, 'rgb(240, 80, 120)');
  assert.ok(dark.alpha < 1);
  assert.equal(light.alpha, 1);
  assert.notEqual(light.fill, 'rgb(240, 80, 120)');
});

const fileStats = (stats) => ({ violations: 0, compliance: 0, weight: 0, files: 1, critical: 0, major: 0, ...stats });
const packFileColor = (stats, palette) => rgbCss(fileSeverityColor(worstOfStats(stats), badness(stats, 1, NODE_KIND.FILE), palette));

test('dots follow the Circle Pack file colour: worst finding, issues against the project average', () => {
  const light = { ...PALETTE, dark: false };
  const heavy = fileStats({ violations: 4, compliance: 1, weight: 8, major: 2 });
  const clean = fileStats({ compliance: 6 });
  assert.equal(fileDotColor(heavy, 1, light), packFileColor(heavy, light));
  assert.equal(fileDotColor(clean, 1, light), packFileColor(clean, light));
  assert.notEqual(fileDotColor(heavy, 1, light), fileDotColor(clean, 1, light));
  assert.equal(fileDotColor(fileStats({}), 1, light), rgbCss(fileSeverityColor(null, 0, light)));
});
