// src/quodeq/ui/src/features/map/viz/core/skyLayers.js
import { TAU } from './galaxyCore.js';
import { rgbCss, labelInk } from './mapPaint.js';
import { SKY_RIM } from './skyLayout.js';
import { RING_STYLE } from './skyPaint.js';
import { SKY_ZONE } from '../../mapVocab.js';
import { drawVeilWithHole, drawHoverRing } from './packLayers.js';

/** The sky uses 90 % of the shorter side's half as its radius. */
export const SKY_SCALE = 0.9;
/**
 * The zones' glows (alpha by theme): fix first a heat core, strongest at the
 * centre and fading toward its ring, with a soft rim inside the line, in the
 * critical colour; watch a haze in the major colour, warmest at the fix-first ring and
 * fading toward its own. Only the fix-first line glows.
 */
const ZONE_GLOW = {
  dark: { core: 0.34, coreEdge: 0.16, rim: 0.3, haze: 0.22, hazeEdge: 0.13, fixFirstLine: 0.9, watchLine: 0.55 },
  light: { core: 0.24, coreEdge: 0.13, rim: 0.24, haze: 0.18, hazeEdge: 0.11, fixFirstLine: 0.8, watchLine: 0.65 },
};
const RIM_GLOW_SHARE = 0.18;
const LINE_GLOW_PX = 8;
const ZONE_LABEL_PX = 10;
const ZONE_LABEL_WEIGHT = 600;
const ZONE_LABEL_GAP_PX = 5;
const BAND_DASH_PX = 5;
const BAND_DASH = [BAND_DASH_PX, BAND_DASH_PX];
const RING_DASH_PX = 5;
const RING_GAP_PX = 4;
const RING_DASH = [RING_DASH_PX, RING_GAP_PX];
const NO_DASH = [];
const BAND_ALPHA_FAINT = 0.3;
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
const HALO_WIDTH = 3.5;
const TITLE_WEIGHT = 600;

const side = (palette) => (palette.dark ? 'dark' : 'light');

/** The rim, then the watch and fix-first lines where this project's layout put them. */
function bandsFor(rings, palette) {
  return [
    { at: SKY_RIM, color: palette.textMuted, alpha: BAND_ALPHA_FAINT, width: BAND_WIDTH_RIM },
    { at: rings.watch, zone: SKY_ZONE.WATCH, color: palette.sevMajor, width: BAND_WIDTH_WATCH },
    { at: rings.fixFirst, zone: SKY_ZONE.FIX_FIRST, color: palette.sevCritical, width: BAND_WIDTH_FIX },
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

/** The bubble under a point (the one whose centre is relatively closest), or null; a bubble of radius 0 is not there. */
export function pickBubble(bubbles, x, y) {
  let best = null;
  let bestRatio = Infinity;
  bubbles.forEach((b, i) => {
    const d = Math.hypot(b.px - x, b.py - y);
    if (b.R <= 0 || d > b.R + PICK_GRACE_PX) return;
    const ratio = d / Math.max(b.R, 1);
    if (ratio < bestRatio) { bestRatio = ratio; best = i; }
  });
  return best;
}

const rgba = ({ r, g, b }, a) => `rgba(${r}, ${g}, ${b}, ${a})`;

/** One radial glow between two radii, with colour stops as [share of the way, alpha]. */
function radialGlow(ctx, { cx, cy, from, to }, color, stops) {
  const g = ctx.createRadialGradient(cx, cy, from, cx, cy, to);
  for (const [at, a] of stops) g.addColorStop(at, rgba(color, a));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, to, 0, TAU);
  if (from > 0) ctx.arc(cx, cy, from, 0, TAU, true);
  ctx.fill();
}

/** The zones as glows: the fix-first heat core with its rim, and the watch haze around it. */
function drawZones(ctx, frame, rings, palette) {
  const { cx, cy, s } = frame;
  const glow = ZONE_GLOW[side(palette)];
  const fix = rings.fixFirst * s;
  radialGlow(ctx, { cx, cy, from: fix, to: rings.watch * s }, palette.sevMajor, [[0, glow.haze], [1, glow.hazeEdge]]);
  radialGlow(ctx, { cx, cy, from: 0, to: fix }, palette.sevCritical, [[0, glow.core], [1 - RIM_GLOW_SHARE, glow.coreEdge], [1, glow.rim]]);
}

function drawBands(ctx, frame, rings, palette) {
  const glow = ZONE_GLOW[side(palette)];
  ctx.setLineDash(BAND_DASH);
  for (const band of bandsFor(rings, palette)) {
    const muted = !band.zone;
    ctx.beginPath();
    ctx.arc(frame.cx, frame.cy, band.at * frame.s, 0, TAU);
    ctx.strokeStyle = rgbCss(band.color);
    ctx.globalAlpha = muted ? band.alpha : glow[`${band.zone}Line`];
    ctx.lineWidth = band.width;
    // Only fix first glows, so it stays the stronger line where the two colours sit close.
    const glows = band.zone === SKY_ZONE.FIX_FIRST;
    ctx.shadowColor = glows ? rgbCss(band.color) : 'transparent';
    ctx.shadowBlur = glows ? LINE_GLOW_PX : 0;
    ctx.stroke();
  }
  ctx.setLineDash(NO_DASH);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 1;
}

/** The canvas font of a zone's label (its name and count on top of its ring). */
export function skyZoneFont(font, fontScale) {
  return `${ZONE_LABEL_WEIGHT} ${ZONE_LABEL_PX * fontScale}px ${font}`;
}

/**
 * Where each zone's label sits: centred on top of its ring. `zoneLabels`
 * holds each label's text and measured width; the boxes keep area labels off them.
 * @returns {{text: string, x: number, y: number, box: {x0: number, x1: number, y0: number, y1: number}, zone: string}[]}
 */
export function placeZoneLabels(frame, rings, zoneLabels, fontScale) {
  return [SKY_ZONE.FIX_FIRST, SKY_ZONE.WATCH].map((zone) => {
    const { text, w } = zoneLabels[zone];
    const y = frame.cy - rings[zone] * frame.s - ZONE_LABEL_GAP_PX;
    return { zone, text, x: frame.cx, y, box: { x0: frame.cx - w / 2, x1: frame.cx + w / 2, y0: y - ZONE_LABEL_PX * fontScale, y1: y } };
  });
}

/** Each zone's name and count on top of its ring, over the bubbles. */
function drawZoneLabels(ctx, { zoneLabels, palette, font, fontScale }) {
  if (!zoneLabels) return;
  const color = { [SKY_ZONE.FIX_FIRST]: palette.sevCritical, [SKY_ZONE.WATCH]: palette.sevMajor };
  ctx.textAlign = 'center';
  ctx.font = skyZoneFont(font, fontScale);
  ctx.lineWidth = HALO_WIDTH;
  ctx.strokeStyle = rgbCss(palette.bg);
  for (const label of zoneLabels) {
    ctx.strokeText(label.text, label.x, label.y);
    ctx.fillStyle = rgbCss(color[label.zone]);
    ctx.fillText(label.text, label.x, label.y);
  }
}

function drawCentre(ctx, frame, palette) {
  const hot = rgbCss(palette.sevCritical);
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

/** One area bubble: its fill and outline, its kind ring, and its file dots. */
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
 * The static layer: zone glows, bands, centre mark, bubbles largest first,
 * then the zone labels on top. `rings` are skyRings distances, so the lines
 * and the glows follow the areas on the sky.
 */
export function drawSkyStatic(ctx, { frame, rings, bubbles, paints, files, palette, width, height, zoneLabels, font, fontScale }) {
  ctx.clearRect(0, 0, width, height);
  drawZones(ctx, frame, rings, palette);
  drawBands(ctx, frame, rings, palette);
  drawCentre(ctx, frame, palette);
  const order = bubbles.map((_, i) => i).sort((a, b) => bubbles[b].R - bubbles[a].R);
  for (const i of order) drawBubble(ctx, bubbles[i], paints[i], files[i]);
  drawZoneLabels(ctx, { zoneLabels, palette, font, fontScale });
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
  ctx.fillStyle = rgbCss(labelInk(palette));
  ctx.fillText(label.title, label.x, label.y);
}

/** The overlay: one veil around the kept bubble, the hover ring, and the labels. */
export function drawSkyOverlay(ctx, { bubbles, keepIndex, hoverIndex, labels, palette, font, fontScale, width, height }) {
  ctx.clearRect(0, 0, width, height);
  if (keepIndex !== null && bubbles[keepIndex]) drawVeil(ctx, bubbles[keepIndex], palette, { width, height });
  if (hoverIndex !== null && bubbles[hoverIndex]) drawHover(ctx, bubbles[hoverIndex], palette);
  ctx.textAlign = 'center';
  for (const label of labels) drawLabel(ctx, label, { palette, font, fontScale });
}
