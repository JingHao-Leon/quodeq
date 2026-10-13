import { isDrawable } from './packCanvasGeometry.js';
import { TAU } from './galaxyCore.js';
import { clamp } from './mapBadness.js';
import { chainLabel } from './chainLabel.js';
import { rgbCss } from './mapPaint.js';
import { isPackFolder } from './packNode.js';

/** Files are drawn at 84 % of their slot, so siblings never touch. */
export const FILE_SLOT_SCALE = 0.84;
/** The dimming veil: page colour over everything but the kept circle. */
export const VEIL_ALPHA_DARK = 0.62;
export const VEIL_ALPHA_LIGHT = 0.6;
const INSET_SHARE = 0.02;          // folders drawn 2 % inside their slot
const INSET_MIN_PX = 0.5;
const INSET_MAX_PX = 2.5;
const STROKE_PX = 1;
const HOVER_STROKE_PX = 1.6;
const HOVER_STROKE_ALPHA = 0.8;
const LABEL_MIN_R = 10;
const LABEL_FONT_MAX = 11;
const LABEL_FONT_MIN = 8;
const LABEL_FONT_DIVISOR = 4;
const LABEL_GAP = 4;
const LABEL_WEIGHT_FOLDER = '600';
const LABEL_WEIGHT_FILE = '400';
const EVEN_ODD = 'evenodd';

function toPx(sc, viewport) {
  return { px: viewport.ox + sc.cx * viewport.scale, py: viewport.oy + sc.cy * viewport.scale, r: sc.r * viewport.scale };
}

/** Folder radius in pixels after the proportional inset. */
function folderRadius(rPx) {
  return Math.max(0, rPx - clamp(rPx * INSET_SHARE, INSET_MIN_PX, INSET_MAX_PX));
}

function traceCutOut(ctx, c, at, index) {
  for (const child of c.children || []) {
    if (!isPackFolder(child)) continue;
    const i = index.get(child);
    if (i === undefined) continue;
    const p = at(i);
    const r = folderRadius(p.r);
    if (r <= 0) continue;
    ctx.moveTo(p.px + r, p.py);
    ctx.arc(p.px, p.py, r, 0, TAU);
  }
}

function drawFolder(ctx, { c, p, paint, at, index }) {
  const r = folderRadius(p.r);
  ctx.beginPath();
  ctx.arc(p.px, p.py, r, 0, TAU);
  if (!paint.outlineOnly) {
    if (paint.cutOut) traceCutOut(ctx, c, at, index);
    ctx.globalAlpha = paint.alpha;
    ctx.fillStyle = paint.fill;
    ctx.fill(paint.cutOut ? EVEN_ODD : undefined);
  }
  ctx.beginPath();
  ctx.arc(p.px, p.py, r, 0, TAU);
  ctx.globalAlpha = paint.strokeAlpha;
  ctx.lineWidth = STROKE_PX;
  ctx.strokeStyle = paint.stroke;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawFile(ctx, p, paint) {
  ctx.beginPath();
  ctx.arc(p.px, p.py, p.r * FILE_SLOT_SCALE, 0, TAU);
  ctx.globalAlpha = 1;
  ctx.fillStyle = paint.fill;
  ctx.fill();
}

/**
 * The static layer: every visible circle, parents before children.
 * `index` maps each circle to its position in `circles`; the caller builds it
 * once per circles array, so a tween frame does not rebuild it.
 * @returns {number} circles drawn
 */
export function drawStatic(ctx, { circles, screenCoords, viewport, paint, index, width, height }) {
  ctx.clearRect(0, 0, width, height);
  const at = (i) => toPx(screenCoords[i], viewport);
  let drawn = 0;
  circles.forEach((c, i) => {
    if (!isDrawable(screenCoords[i], viewport, width, height)) return;
    const p = at(i);
    if (paint[i].file) drawFile(ctx, p, paint[i]);
    else drawFolder(ctx, { c, p, paint: paint[i], at, index });
    drawn++;
  });
  return drawn;
}

function drawVeil(ctx, p, palette, size) {
  const r = folderRadius(p.r);
  ctx.beginPath();
  ctx.rect(0, 0, size.width, size.height);
  ctx.moveTo(p.px + r, p.py);
  ctx.arc(p.px, p.py, r, 0, TAU, true);
  ctx.closePath();
  ctx.globalAlpha = palette.dark ? VEIL_ALPHA_DARK : VEIL_ALPHA_LIGHT;
  ctx.fillStyle = rgbCss(palette.bg);
  ctx.fill(EVEN_ODD);
  ctx.globalAlpha = 1;
}

function drawHover(ctx, p, palette) {
  ctx.beginPath();
  ctx.arc(p.px, p.py, folderRadius(p.r), 0, TAU);
  ctx.globalAlpha = HOVER_STROKE_ALPHA;
  ctx.lineWidth = HOVER_STROKE_PX;
  ctx.strokeStyle = rgbCss(palette.text);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function labelCandidates({ circles, screenCoords, viewport, focusNode }) {
  const out = [];
  circles.forEach((c, i) => {
    const p = toPx(screenCoords[i], viewport);
    if (c.parent === focusNode && p.r > LABEL_MIN_R) out.push({ c, p });
  });
  return out.sort((a, b) => b.p.r - a.p.r);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Labels of the focus's children, largest circle first; a label whose box
 * would overlap one already placed is skipped, so labels never collide. */
function drawLabels(ctx, { circles, screenCoords, viewport, focusNode, palette, font }) {
  ctx.fillStyle = rgbCss(palette.text);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const placed = [];
  for (const { c, p } of labelCandidates({ circles, screenCoords, viewport, focusNode })) {
    const size = Math.min(LABEL_FONT_MAX, Math.max(LABEL_FONT_MIN, p.r / LABEL_FONT_DIVISOR));
    ctx.font = `${isPackFolder(c) ? LABEL_WEIGHT_FOLDER : LABEL_WEIGHT_FILE} ${size}px ${font}`;
    const text = chainLabel(c.data.name);
    const w = ctx.measureText(text).width;
    const y = p.py - p.r - LABEL_GAP;
    const box = { x: p.px - w / 2, y: y - size, w, h: size };
    if (placed.some((b) => overlaps(b, box))) continue;
    placed.push(box);
    ctx.fillText(text, p.px, y);
  }
}

/** The overlay: one veil around the kept circle, the hover ring, and labels of the focus's children. */
export function drawOverlay(ctx, { circles, screenCoords, viewport, keepIndex, hoverIndex, focusNode, showLabels, palette, font, width, height }) {
  ctx.clearRect(0, 0, width, height);
  if (keepIndex !== null && circles[keepIndex]?.depth > 0) drawVeil(ctx, toPx(screenCoords[keepIndex], viewport), palette, { width, height });
  if (hoverIndex !== null) drawHover(ctx, toPx(screenCoords[hoverIndex], viewport), palette);
  if (showLabels) drawLabels(ctx, { circles, screenCoords, viewport, focusNode, palette, font });
}
