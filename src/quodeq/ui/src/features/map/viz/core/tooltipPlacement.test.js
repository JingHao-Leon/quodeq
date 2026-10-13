import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampTooltipToBox, clampTooltipToElement, hoverWithTooltipPos } from './tooltipPlacement.js';

const BOX = { offsetWidth: 400, offsetHeight: 300 };

test('a tooltip inside an element is clamped to that element\'s measured box', () => {
  assert.deepEqual(clampTooltipToElement(390, 290, BOX), clampTooltipToBox(390, 290, BOX.offsetWidth, BOX.offsetHeight));
});

test('a missing element clamps to the fallback box', () => {
  assert.deepEqual(clampTooltipToElement(10, 10, null), clampTooltipToBox(10, 10));
});

test('a hover keeps its fields and gains its clamped tooltip position', () => {
  assert.deepEqual(hoverWithTooltipPos({ index: 3, x: 390, y: 290 }, BOX),
    { index: 3, x: 390, y: 290, pos: clampTooltipToBox(390, 290, BOX.offsetWidth, BOX.offsetHeight) });
});

test('no hover stays no hover', () => {
  assert.equal(hoverWithTooltipPos(null, BOX), null);
});
