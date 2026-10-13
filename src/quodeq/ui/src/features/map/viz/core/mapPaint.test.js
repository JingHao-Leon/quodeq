import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mixRgb, rgbCss, badnessHue, badnessStrength, fileStrength,
  activityScale, activityFileStrength, activityFolderStrength,
} from './mapPaint.js';

const RED = { r: 240, g: 80, b: 120 };
const CYAN = { r: 0, g: 212, b: 255 };
const GREY = { r: 138, g: 143, b: 168 };
const PALETTE = { worse: RED, better: CYAN, neutral: GREY };
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const close = (a, b) => Math.abs(a - b) < 1e-6;

test('mixing and css output', () => {
  assert.deepEqual(mixRgb(BLACK, WHITE, 0.5), { r: 128, g: 128, b: 128 });
  assert.equal(rgbCss({ r: 1, g: 2, b: 3 }), 'rgb(1, 2, 3)');
});

test('hue by side, with a neutral band around zero', () => {
  assert.equal(badnessHue(0.5, PALETTE), RED);
  assert.equal(badnessHue(-0.5, PALETTE), CYAN);
  assert.equal(badnessHue(0.01, PALETTE), GREY);
});

test('strength grows with |badness| and problems lead', () => {
  assert.ok(badnessStrength(1, true) > badnessStrength(-1, true));
  assert.ok(badnessStrength(0.5, false) < badnessStrength(1, false));
  assert.ok(close(badnessStrength(0, true), 0.06));
});

test('file strength stays inside its band', () => {
  assert.ok(close(fileStrength(0, true), 0.45));
  assert.ok(close(fileStrength(1, true), 1));
  assert.ok(close(fileStrength(1, false), 0.92));
});

test('activity scale is the 90th percentile of edited files, at least 2', () => {
  assert.equal(activityScale([0, 0, 1]), 2);
  assert.equal(activityScale([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
});

test('activity strengths', () => {
  assert.equal(activityFileStrength(0, 4), 0);
  assert.ok(close(activityFileStrength(4, 4), 1));
  assert.ok(activityFolderStrength(1, true) > activityFolderStrength(0.1, true));
  assert.ok(close(activityFolderStrength(0, false), 0.05));
});
