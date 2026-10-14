import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampTooltipToViewport } from './tooltipPlacement.js';
import { TOOLTIP_CURSOR_OFFSET, TOOLTIP_EST_W, TOOLTIP_EST_H } from './galaxyTunables.js';

const VIEWPORT = { w: 1200, h: 800 };
const NEAR = 10;

test('a tooltip sits just off the cursor', () => {
  assert.deepEqual(clampTooltipToViewport(NEAR, NEAR, VIEWPORT.w, VIEWPORT.h),
    { left: NEAR + TOOLTIP_CURSOR_OFFSET, top: NEAR + TOOLTIP_CURSOR_OFFSET });
});

test('near the viewport edge it is pulled back inside', () => {
  assert.deepEqual(clampTooltipToViewport(VIEWPORT.w, VIEWPORT.h, VIEWPORT.w, VIEWPORT.h),
    { left: VIEWPORT.w - TOOLTIP_EST_W, top: VIEWPORT.h - TOOLTIP_EST_H });
});
