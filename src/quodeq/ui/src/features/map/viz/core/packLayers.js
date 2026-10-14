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
/**
 * The pack's three brightness levels: what you are in or about to go to,
 * what steps back, and the context outside the open folder.
 */
export const FADE = Object.freeze({ ACTIVE: 1, RECEDED: 0.65, CONTEXT: 0.15 });
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
const EVEN_ODD = 'evenodd';
/** Dash and gap of an absent (ghost) circle's outline, in pixels. */
export const GHOST_DASH_PX = 2;
/** Outline opacity of an absent (ghost) circle. */
export const GHOST_STROKE_ALPHA = 0.45;
const GHOST_DASH = [GHOST_DASH_PX, GHOST_DASH_PX];
const NO_DASH = [];

function toPx(sc, viewport) {
  return { px: viewport.ox + sc.cx * viewport.scale, py: viewport.oy + sc.cy * viewport.scale, r: sc.r * viewport.scale };
}

/** Folder radius in pixels after the proportional inset. */
function folderRadius(rPx) {
  return Math.max(0, rPx - clamp(rPx * INSET_SHARE, INSET_MIN_PX, INSET_MAX_PX));
}

/** Holes for the sub-folders drawn solid inside `c`; one drawn dotted (absent), still fading in
 * (time-lapse move) or not at all keeps its parent's fill. */
function traceCutOut(ctx, { c, at, index, paints }) {
  for (const child of c.children || []) {
    if (!isPackFolder(child)) continue;
    const i = index.get(child);
    if (i === undefined || !paints[i] || paints[i].ghost || paints[i].arriving) continue;
    const p = at(i);
    const r = folderRadius(p.r);
    if (r <= 0) continue;
    ctx.moveTo(p.px + r, p.py);
    ctx.arc(p.px, p.py, r, 0, TAU);
  }
}

function drawFolder(ctx, { c, p, paint, at, index, paints, fade = 1 }) {
  const r = folderRadius(p.r);
  ctx.beginPath();
  ctx.arc(p.px, p.py, r, 0, TAU);
  if (!paint.outlineOnly) {
    if (paint.cutOut) traceCutOut(ctx, { c, at, index, paints });
    ctx.globalAlpha = paint.alpha * fade;
    ctx.fillStyle = paint.fill;
    ctx.fill(paint.cutOut ? EVEN_ODD : undefined);
  }
  ctx.beginPath();
  ctx.arc(p.px, p.py, r, 0, TAU);
  ctx.globalAlpha = paint.strokeAlpha * fade;
  ctx.lineWidth = STROKE_PX;
  ctx.strokeStyle = paint.stroke;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A file's fill at its paint's opacity (1 except while it fades in during a time-lapse move), times `fade`. */
function drawFile(ctx, p, paint, fade = 1) {
  ctx.beginPath();
  ctx.arc(p.px, p.py, p.r * FILE_SLOT_SCALE, 0, TAU);
  ctx.globalAlpha = (paint.alpha ?? 1) * fade;
  ctx.fillStyle = paint.fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * A dotted, unfilled circle of radius `r` at (px, py): how both vizzes draw
 * something absent from the run shown (time-lapse). Leaves the dash off and
 * globalAlpha back at 1.
 * @param {{stroke: string, strokeAlpha: number}} paint
 */
export function strokeGhostCircle(ctx, { px, py, r }, paint, lineWidth) {
  ctx.beginPath();
  ctx.arc(px, py, r, 0, TAU);
  ctx.setLineDash(GHOST_DASH);
  ctx.globalAlpha = paint.strokeAlpha;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = paint.stroke;
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.globalAlpha = 1;
}

/** A circle absent from the run shown, at the radius a file or folder would be drawn at. */
function drawGhost(ctx, p, paint) {
  const r = paint.file ? p.r * FILE_SLOT_SCALE : folderRadius(p.r);
  strokeGhostCircle(ctx, { px: p.px, py: p.py, r }, paint, STROKE_PX);
}

/** Circles that are `top` or inside it (circles come parents first). */
function subtreeMask(circles, index, top) {
  const mask = new Uint8Array(circles.length);
  circles.forEach((c, i) => {
    const p = c.parent ? index.get(c.parent) : undefined;
    mask[i] = c === top || (p !== undefined && mask[p]) ? 1 : 0;
  });
  return mask;
}

/** What the brightness depends on: the open folder's subtree, a previewed circle's, a selected file's. */
function fadeState(circles, index, { focusNode, hoverNode, selectedNode }) {
  const atRoot = !(focusNode?.depth > 0);
  const inFocus = atRoot ? null : subtreeMask(circles, index, focusNode);
  const hoverInside = Boolean(hoverNode) && (atRoot || inFocus[index.get(hoverNode)] === 1);
  const preview = hoverNode && !hoverInside ? subtreeMask(circles, index, hoverNode) : null;
  const selected = !preview && selectedNode ? subtreeMask(circles, index, selectedNode) : null;
  return { atRoot, inFocus, preview, selected, openDepth: atRoot ? 0 : focusNode.depth };
}

function fadeAt(i, circle, st) {
  const inside = st.atRoot || st.inFocus[i] === 1;
  if (st.preview) {
    if (inside) return FADE.RECEDED;
    return st.preview[i] ? FADE.ACTIVE : FADE.CONTEXT;
  }
  if (!inside) return FADE.CONTEXT;
  return st.selected && !st.selected[i] && circle.depth > st.openDepth ? FADE.RECEDED : FADE.ACTIVE;
}

/**
 * The opacity each circle is drawn at, one FADE level per circle. Inside the
 * open folder: active; outside it: context. Hovering a circle outside the
 * open folder, or above it, previews it: it and its content go active and the
 * open folder steps back. A selected file steps the rest of the open folder
 * back. Hovering inside the open folder changes nothing.
 * @param {{focusNode?: object, hoverNode?: object, selectedNode?: object}} state
 * @returns {Float32Array}
 */
export function fadesFor(circles, index, state = {}) {
  const st = fadeState(circles, index, state);
  return Float32Array.from(circles, (c, i) => fadeAt(i, c, st));
}

/**
 * The static layer: every visible circle, parents before children, each at
 * its `fades` opacity (all active without it).
 * `index` maps each circle to its position in `circles`; the caller builds it
 * once per circles array, so a tween frame does not rebuild it.
 * A ghost paint (time-lapse: absent from the run shown) draws a dotted
 * outline, and a `ghostRing` (a circle arriving during a move) draws one
 * under the fill; a circle without paint is not drawn.
 * @returns {number} circles drawn
 */
export function drawStatic(ctx, { circles, screenCoords, viewport, paint, index, width, height, fades = null }) {
  ctx.clearRect(0, 0, width, height);
  const at = (i) => toPx(screenCoords[i], viewport);
  let drawn = 0;
  circles.forEach((c, i) => {
    if (!paint[i] || screenCoords[i].r <= 0 || !isDrawable(screenCoords[i], viewport, width, height)) return;
    const p = at(i);
    const fade = fades ? fades[i] : FADE.ACTIVE;
    if (paint[i].ghostRing) drawGhost(ctx, p, paint[i].ghostRing);
    if (paint[i].ghost) drawGhost(ctx, p, paint[i]);
    else if (paint[i].file) drawFile(ctx, p, paint[i], fade);
    else drawFolder(ctx, { c, p, paint: paint[i], at, index, paints: paint, fade });
    drawn++;
  });
  return drawn;
}

/** Fills the canvas with the themed veil, leaving a round hole at (px, py) (the Risk sky's selection). */
export function drawVeilWithHole(ctx, { px, py, r }, palette, size) {
  ctx.beginPath();
  ctx.rect(0, 0, size.width, size.height);
  ctx.moveTo(px + r, py);
  ctx.arc(px, py, r, 0, TAU, true);
  ctx.closePath();
  ctx.globalAlpha = palette.dark ? VEIL_ALPHA_DARK : VEIL_ALPHA_LIGHT;
  ctx.fillStyle = rgbCss(palette.bg);
  ctx.fill(EVEN_ODD);
  ctx.globalAlpha = 1;
}

/** The hover ring both vizzes draw: a thin text-coloured circle of radius `r` at (px, py). */
export function drawHoverRing(ctx, { px, py, r }, palette) {
  ctx.beginPath();
  ctx.arc(px, py, r, 0, TAU);
  ctx.globalAlpha = HOVER_STROKE_ALPHA;
  ctx.lineWidth = HOVER_STROKE_PX;
  ctx.strokeStyle = rgbCss(palette.text);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHover(ctx, p, palette) {
  drawHoverRing(ctx, { px: p.px, py: p.py, r: folderRadius(p.r) }, palette);
}

/**
 * The open folder's sub-folders big enough to label, largest first (a file's
 * name lives in the hover card), and the open folder's own index (-1 at the root).
 */
function labelCandidates({ circles, screenCoords, viewport, focusNode }) {
  const out = [];
  let open = -1;
  circles.forEach((c, i) => {
    if (c === focusNode) open = i;
    if (c.parent !== focusNode || !isPackFolder(c)) return;
    const p = toPx(screenCoords[i], viewport);
    if (p.r > LABEL_MIN_R) out.push({ p, i });
  });
  return { open: focusNode?.depth > 0 ? open : -1, candidates: out.sort((a, b) => b.p.r - a.p.r) };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function labelSize(rPx, fontScale) {
  return Math.min(LABEL_FONT_MAX * fontScale, Math.max(LABEL_FONT_MIN * fontScale, rPx / LABEL_FONT_DIVISOR));
}

/** A label's text and box, centred above a circle (`pinned`: kept inside the canvas when the circle's top is off screen). */
function labelBox(ctx, { text, p, size, font, pinned }) {
  ctx.font = `${LABEL_WEIGHT_FOLDER} ${size}px ${font}`;
  const w = ctx.measureText(text).width;
  const above = p.py - p.r - LABEL_GAP;
  const y = pinned ? Math.max(above, size + LABEL_GAP) : above;
  return { text, x: p.px - w / 2, y: y - size, w, h: size, cx: p.px, base: y };
}

/**
 * Labels, when on: the hovered folder's name and the open folder's name come
 * first (kept inside the canvas), then the open folder's sub-folders, largest
 * first; a label whose box would overlap one already placed is skipped, so
 * labels never collide.
 */
function drawLabels(ctx, { circles, screenCoords, viewport, focusNode, hoverIndex, palette, font, fontScale }) {
  ctx.fillStyle = rgbCss(palette.text);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const label = (i) => chainLabel(circles[i].data.name);
  const { open, candidates } = labelCandidates({ circles, screenCoords, viewport, focusNode });
  const boxes = [];
  const hovered = hoverIndex === null ? null : circles[hoverIndex];
  if (hovered && isPackFolder(hovered)) {
    const p = toPx(screenCoords[hoverIndex], viewport);
    boxes.push(labelBox(ctx, { text: label(hoverIndex), p, size: labelSize(p.r, fontScale), font, pinned: true }));
  }
  if (open >= 0) boxes.push(labelBox(ctx, { text: label(open), p: toPx(screenCoords[open], viewport), size: LABEL_FONT_MAX * fontScale, font, pinned: true }));
  for (const { p, i } of candidates) {
    if (i === hoverIndex) continue;
    const box = labelBox(ctx, { text: label(i), p, size: labelSize(p.r, fontScale), font, pinned: false });
    if (!boxes.some((b) => overlaps(b, box))) boxes.push(box);
  }
  for (const b of boxes) {
    ctx.font = `${LABEL_WEIGHT_FOLDER} ${b.h}px ${font}`;
    ctx.fillText(b.text, b.cx, b.base);
  }
}

/** The overlay: the hover ring and, with labels on, the labels. Brightness lives on the static layer (fadesFor). */
export function drawOverlay(ctx, { circles, screenCoords, viewport, hoverIndex, focusNode, showLabels, palette, font, width, height, fontScale = 1 }) {
  ctx.clearRect(0, 0, width, height);
  if (hoverIndex !== null) drawHover(ctx, toPx(screenCoords[hoverIndex], viewport), palette);
  if (showLabels) drawLabels(ctx, { circles, screenCoords, viewport, focusNode, hoverIndex, palette, font, fontScale });
}
