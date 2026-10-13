import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyAreaPaint, dotColor, RING_STYLE } from './skyPaint.js';
import { AREA_KIND } from '../../mapVocab.js';
import { SEVERITY } from '../../../../vocab/severity.js';

const C = (r, g, b) => ({ r, g, b });
const PALETTE = {
  bg: C(10, 10, 10), surfaceAlt: C(20, 20, 20), text: C(230, 230, 230), worse: C(240, 80, 120),
  better: C(0, 212, 255), neutral: C(138, 143, 168), sevCritical: C(255, 74, 74), sevMajor: C(240, 80, 120), sevMinor: C(185, 138, 166),
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

test('dots by worst violation', () => {
  assert.equal(dotColor(SEVERITY.CRITICAL, PALETTE), 'rgb(255, 74, 74)');
  assert.equal(dotColor(SEVERITY.MINOR, PALETTE), 'rgb(185, 138, 166)');
  assert.equal(dotColor(null, PALETTE), 'rgb(138, 143, 168)');
});
