import { TAU } from './galaxyCore.js';
import { clamp } from './mapBadness.js';
import { isPackFolder } from './packNode.js';

const INSET_SHARE = 0.02;          // folders drawn 2 % inside their slot
const INSET_MIN_PX = 0.5;
const INSET_MAX_PX = 2.5;
/** Outline width of a folder (and of a ghost circle), in pixels. */
export const STROKE_PX = 1;
const EVEN_ODD = 'evenodd';
/**
 * The glow is a few wide, faint strokes on the rim, widest first: a soft edge at the cost of
 * plain strokes. (shadowBlur looked the same but cost a blur per folder on every frame the pack
 * redraws, zooms and hover fades included, and stuttered on large projects.)
 */
const GLOW_REACH_PX = 14;  // how far in from its rim the worst folder's glow reaches
const GLOW_REACH_SHARE = 0.25; // and never more than this share of the radius, so a small folder keeps a ring
const GLOW_STEPS = 3;
/** Glow and rim opacity, base plus span times the glow; a worse folder's rim stays close to its fill. */
const GLOW_TONE = Object.freeze({
  worse: { glowBase: 0.12, glowSpan: 0.3, rimBase: 0.05, rimSpan: 0.05 },
  better: { glowBase: 0.14, glowSpan: 0.4, rimBase: 0.03, rimSpan: 0.03 },
});
const RIM_PX = 1;
/** Folders smaller than this on screen get no glow: it would not read, and costs strokes. */
const GLOW_MIN_R_PX = 8;

const rgba = ({ r, g, b }, a) => `rgba(${r}, ${g}, ${b}, ${a})`;

/**
 * Dark glass: a soft glow in the folder's own hue inside its rim, sized by
 * `paint.glow` (0 draws nothing). Leaves the alpha at 1.
 * @param {{px: number, py: number}} p circle centre in pixels
 * @param {number} r folder radius in pixels
 */
export function drawFolderGlow(ctx, p, r, paint, fade = 1) {
  const g = paint.glow;
  if (!(g > 0) || !paint.hue || paint.arriving || r < GLOW_MIN_R_PX) return;
  const tone = paint.badness < 0 ? GLOW_TONE.better : GLOW_TONE.worse;
  ctx.globalAlpha = fade;
  ctx.strokeStyle = rgba(paint.hue, (tone.glowBase + tone.glowSpan * g) / GLOW_STEPS);
  // Each stroke sits just inside the rim (its radius less half its width), so the glow points inward.
  const reach = Math.min(GLOW_REACH_PX, r * GLOW_REACH_SHARE) * g;
  for (let k = GLOW_STEPS; k > 0; k--) {
    const w = reach * (k / GLOW_STEPS);
    ctx.beginPath();
    ctx.arc(p.px, p.py, r - w / 2, 0, TAU);
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(p.px, p.py, r, 0, TAU);
  ctx.lineWidth = RIM_PX;
  ctx.strokeStyle = rgba(paint.hue, tone.rimBase + tone.rimSpan * g);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Folder radius in pixels after the proportional inset. */
export function folderRadius(rPx) {
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

/** Dark glass: a share of the folder's tint under its cut-out sub-folders (fillStyle already set). */
function fillHoles(ctx, scene, alpha) {
  ctx.beginPath();
  traceCutOut(ctx, scene);
  ctx.globalAlpha = alpha;
  ctx.fill();
}

/** A folder: its fill (cut out under drawn sub-folders, which keep `holeShare` of it), outline and, in dark, its glow. */
export function drawFolder(ctx, { c, p, paint, at, index, paints, fade = 1 }) {
  const r = folderRadius(p.r);
  ctx.beginPath();
  ctx.arc(p.px, p.py, r, 0, TAU);
  if (!paint.outlineOnly) {
    if (paint.cutOut) traceCutOut(ctx, { c, at, index, paints });
    ctx.globalAlpha = paint.alpha * fade;
    ctx.fillStyle = paint.fill;
    ctx.fill(paint.cutOut ? EVEN_ODD : undefined);
    if (paint.cutOut && paint.holeShare > 0) fillHoles(ctx, { c, at, index, paints }, paint.alpha * paint.holeShare * fade);
  }
  ctx.beginPath();
  ctx.arc(p.px, p.py, r, 0, TAU);
  ctx.globalAlpha = paint.strokeAlpha * fade;
  ctx.lineWidth = STROKE_PX;
  ctx.strokeStyle = paint.stroke;
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawFolderGlow(ctx, p, r, paint, fade);
}
