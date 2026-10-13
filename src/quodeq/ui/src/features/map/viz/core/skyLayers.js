// src/quodeq/ui/src/features/map/viz/core/skyLayers.js
import { TAU } from './galaxyCore.js';
import { rgbCss, mixRgb } from './mapPaint.js';
import { SKY_RIM } from './skyLayout.js';
import { RING_STYLE } from './skyPaint.js';
import { LABEL_LINE_PX } from './skyLabels.js';
import { drawVeilWithHole, drawHoverRing } from './packLayers.js';

/** The sky uses 90 % of the shorter side's half as its radius. */
export const SKY_SCALE = 0.9;
const GLOW_ALPHA = { dark: 0.26, light: 0.14 };
const WATCH_GLOW_SHARE = 0.4;
const BAND_DASH_PX = 5;
const RING_DASH_PX = 5;
const RING_GAP_PX = 4;
const BAND_DASH = [BAND_DASH_PX, BAND_DASH_PX];
const RING_DASH = [RING_DASH_PX, RING_GAP_PX];
const NO_DASH = [];
const BAND_ALPHA_FAINT = 0.3;
const BAND_ALPHA_STRONG = 0.5;
const BAND_WIDTH_RIM = 1;
const BAND_WIDTH_WATCH = 1.1;
const BAND_WIDTH_FIX = 1.3;
const BUBBLE_STROKE_WIDTH = 1;
const CENTRE_RING_PX = 7;
const CENTRE_DOT_PX = 2.5;
const CENTRE_RING_ALPHA = 0.55;
const CENTRE_DOT_ALPHA = 0.75;
const KIND_RING_GAP_PX = 3;
const KIND_RING_WIDTH = 2;
const MIN_DOT_BUBBLE_PX = 6;   // smaller bubbles show no files inside
const MIN_DOT_PX = 0.5;
const PICK_GRACE_PX = 3;
const VEIL_GAP_PX = 4;
const HOVER_GAP_PX = 1;
const TITLE_PX = 11.5;
const SUB_PX = 10;
const HALO_WIDTH = 3.5;
const TITLE_WEIGHT = 600;
const SUB_WEIGHT = 500;

const side = (palette) => (palette.dark ? 'dark' : 'light');

/** The rim, then the watch and fix-first lines where this project's layout put them. */
function bandsFor(rings) {
  return [
    { at: SKY_RIM, muted: true, alpha: BAND_ALPHA_FAINT, width: BAND_WIDTH_RIM },
    { at: rings.watch, muted: false, alpha: BAND_ALPHA_FAINT, width: BAND_WIDTH_WATCH },
    { at: rings.fixFirst, muted: false, alpha: BAND_ALPHA_STRONG, width: BAND_WIDTH_FIX },
  ];
}

/** The sky's centre and radius in pixels for a canvas size. */
export function skyFrame(width, height) {
  return { cx: width / 2, cy: height / 2, s: (Math.min(width, height) / 2) * SKY_SCALE };
}

/** Sky-unit nodes to pixel bubbles. */
export function toPixels(nodes, frame) {
  return nodes.map((n) => ({ px: frame.cx + n.x * frame.s, py: frame.cy + n.y * frame.s, R: n.r * frame.s }));
}

/** The bubble under a point (the one whose centre is relatively closest), or null. */
export function pickBubble(bubbles, x, y) {
  let best = null;
  let bestRatio = Infinity;
  bubbles.forEach((b, i) => {
    const d = Math.hypot(b.px - x, b.py - y);
    if (d > b.R + PICK_GRACE_PX) return;
    const ratio = d / Math.max(b.R, 1);
    if (ratio < bestRatio) { bestRatio = ratio; best = i; }
  });
  return best;
}

function drawBackdrop(ctx, frame, rings, palette) {
  const { cx, cy, s } = frame;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, SKY_RIM * s);
  const hot = rgbCss(palette.worse);
  g.addColorStop(0, hot);
  g.addColorStop(rings.fixFirst / SKY_RIM, hot);
  g.addColorStop(rings.watch / SKY_RIM, rgbCss(mixRgb(palette.bg, palette.worse, WATCH_GLOW_SHARE)));
  g.addColorStop(1, rgbCss(palette.bg));
  ctx.globalAlpha = GLOW_ALPHA[side(palette)];
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, SKY_RIM * s, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBands(ctx, frame, rings, palette) {
  ctx.setLineDash(BAND_DASH);
  for (const band of bandsFor(rings)) {
    ctx.beginPath();
    ctx.arc(frame.cx, frame.cy, band.at * frame.s, 0, TAU);
    ctx.strokeStyle = rgbCss(band.muted ? palette.textMuted : palette.worse);
    ctx.globalAlpha = band.alpha;
    ctx.lineWidth = band.width;
    ctx.stroke();
  }
  ctx.setLineDash(NO_DASH);
  ctx.globalAlpha = 1;
}

function drawCentre(ctx, frame, palette) {
  const hot = rgbCss(palette.worse);
  ctx.beginPath();
  ctx.arc(frame.cx, frame.cy, CENTRE_RING_PX, 0, TAU);
  ctx.strokeStyle = hot;
  ctx.globalAlpha = CENTRE_RING_ALPHA;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(frame.cx, frame.cy, CENTRE_DOT_PX, 0, TAU);
  ctx.fillStyle = hot;
  ctx.globalAlpha = CENTRE_DOT_ALPHA;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawKindRing(ctx, b, paint) {
  if (!paint.ring) return;
  ctx.beginPath();
  ctx.arc(b.px, b.py, b.R + KIND_RING_GAP_PX, 0, TAU);
  ctx.setLineDash(paint.ring === RING_STYLE.DASHED ? RING_DASH : NO_DASH);
  ctx.lineWidth = KIND_RING_WIDTH;
  ctx.strokeStyle = paint.ringColor;
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
}

function drawFiles(ctx, b, files) {
  if (b.R <= MIN_DOT_BUBBLE_PX) return;
  files.dots.forEach((d, i) => {
    const r = d.r * b.R;
    if (r < MIN_DOT_PX) return;
    ctx.beginPath();
    ctx.arc(b.px + d.x * b.R, b.py + d.y * b.R, r, 0, TAU);
    ctx.fillStyle = files.colors[i];
    ctx.fill();
  });
}

function drawBubble(ctx, b, paint, files) {
  ctx.beginPath();
  ctx.arc(b.px, b.py, b.R, 0, TAU);
  ctx.globalAlpha = paint.alpha;
  ctx.fillStyle = paint.fill;
  ctx.fill();
  ctx.globalAlpha = paint.strokeAlpha;
  ctx.strokeStyle = paint.stroke;
  ctx.lineWidth = BUBBLE_STROKE_WIDTH;
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawKindRing(ctx, b, paint);
  drawFiles(ctx, b, files);
}

/**
 * The static layer: backdrop, bands, centre mark, then bubbles largest first.
 * `rings` are skyRings distances, so the lines and the glow follow the project.
 */
export function drawSkyStatic(ctx, { frame, rings, bubbles, paints, files, palette, width, height }) {
  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, frame, rings, palette);
  drawBands(ctx, frame, rings, palette);
  drawCentre(ctx, frame, palette);
  const order = bubbles.map((_, i) => i).sort((a, b) => bubbles[b].R - bubbles[a].R);
  for (const i of order) drawBubble(ctx, bubbles[i], paints[i], files[i]);
}

function drawVeil(ctx, b, palette, size) {
  drawVeilWithHole(ctx, { px: b.px, py: b.py, r: b.R + VEIL_GAP_PX }, palette, size);
}

function drawHover(ctx, b, palette) {
  drawHoverRing(ctx, { px: b.px, py: b.py, r: b.R + HOVER_GAP_PX }, palette);
}

/**
 * The canvas font of a label's title line. Label widths are measured with it
 * too, so placement and drawing always agree.
 * @param {string} font font family
 * @param {number} fontScale root font size relative to 16px
 * @returns {string} a CSS font shorthand
 */
export function skyTitleFont(font, fontScale) {
  return `${TITLE_WEIGHT} ${TITLE_PX * fontScale}px ${font}`;
}

function drawLabel(ctx, label, { palette, font, fontScale }) {
  const halo = rgbCss(palette.bg);
  ctx.lineWidth = HALO_WIDTH;
  ctx.strokeStyle = halo;
  ctx.font = skyTitleFont(font, fontScale);
  ctx.strokeText(label.title, label.x, label.y);
  ctx.fillStyle = rgbCss(palette.text);
  ctx.fillText(label.title, label.x, label.y);
  ctx.font = `${SUB_WEIGHT} ${SUB_PX * fontScale}px ${font}`;
  const subY = label.y + LABEL_LINE_PX * fontScale;
  ctx.strokeText(label.sub, label.x, subY);
  ctx.fillStyle = rgbCss(palette.textMuted);
  ctx.fillText(label.sub, label.x, subY);
}

/** The overlay: one veil around the kept bubble, the hover ring, and the labels. */
export function drawSkyOverlay(ctx, { bubbles, keepIndex, hoverIndex, labels, palette, font, fontScale, width, height }) {
  ctx.clearRect(0, 0, width, height);
  if (keepIndex !== null && bubbles[keepIndex]) drawVeil(ctx, bubbles[keepIndex], palette, { width, height });
  if (hoverIndex !== null && bubbles[hoverIndex]) drawHover(ctx, bubbles[hoverIndex], palette);
  ctx.textAlign = 'center';
  for (const label of labels) drawLabel(ctx, label, { palette, font, fontScale });
}
