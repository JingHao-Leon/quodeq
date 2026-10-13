import { TOOLTIP_CURSOR_OFFSET, TOOLTIP_EST_W, TOOLTIP_EST_H } from './galaxyTunables.js';

/**
 * Place a hover tooltip just off the cursor, pulled back so its estimated
 * box stays inside the viewport. Shared by the dimension galaxy and the
 * folder galaxy so both tooltips clamp the same way.
 *
 * @param {number} x - Cursor client X
 * @param {number} y - Cursor client Y
 * @param {number} vw - Viewport width
 * @param {number} vh - Viewport height
 * @returns {{ left: number, top: number }} CSS pixel offsets
 */
export function clampTooltipToViewport(x, y, vw, vh) {
  return {
    left: Math.min(x + TOOLTIP_CURSOR_OFFSET, vw - TOOLTIP_EST_W),
    top: Math.min(y + TOOLTIP_CURSOR_OFFSET, vh - TOOLTIP_EST_H),
  };
}

const BOX_OFFSET = 16;
const BOX_MARGIN_X = 180;
const BOX_MARGIN_Y = 160;
// Box size assumed while the container has not been measured yet.
const BOX_FALLBACK_PX = 300;

/**
 * Place a tooltip just off a point inside a container, pulled back so it
 * never runs off the container edge. Sizes of 0 or missing use a fallback.
 *
 * @param {number} x - Point X relative to the container
 * @param {number} y - Point Y relative to the container
 * @param {number} [width] - Container width
 * @param {number} [height] - Container height
 * @returns {{ left: number, top: number }} CSS pixel offsets
 */
export function clampTooltipToBox(x, y, width, height) {
  return {
    left: Math.min(x + BOX_OFFSET, (width || BOX_FALLBACK_PX) - BOX_MARGIN_X),
    top: Math.min(y + BOX_OFFSET, (height || BOX_FALLBACK_PX) - BOX_MARGIN_Y),
  };
}
