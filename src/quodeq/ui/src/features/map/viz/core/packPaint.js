import { badness, nodeWeight } from './mapBadness.js';
import {
  mixRgb, rgbCss, badnessHue, badnessStrength, folderGlow, fileSeverityColor, fileSeverityHue, activityScale, activityFileStrength,
  activityFolderStrength, activityGlow, GLASS_FOLDER_SCALE, GLASS_PARENT_ALPHA, GLASS_HOLE_SHARE, ACTIVITY_IDLE_SHARE,
  ACTIVITY_PARENT_HEAT_CAP, STROKE_MIX,
} from './mapPaint.js';
import { NODE_KIND, PACK_COLOR_MODE } from '../../mapVocab.js';
import { worstSeverity } from './mapColors.js';
import { filePathKey } from '../../model/mapActivity.js';
import { isPackFolder } from './packNode.js';

const STROKE_ALPHA = 0.22;
/** A wrapper folder's outline (only one sub-folder): almost gone, so a chain does not draw rings. */
const WRAPPER_STROKE_ALPHA = 0.06;
// A glowing folder's outline leans to its own hue and fades with the glow, so it stays close to the fill.
const GLOW_STROKE_MIX = 0.7;
const GLOW_STROKE_FADE = 0.5;

const isLeaf = (n) => !isPackFolder(n);
/** A folder whose only content is one sub-folder. */
const isPassThrough = (n) => n.children?.length === 1 && isPackFolder(n.children[0]);

function kindOf(n) {
  if (isLeaf(n)) return NODE_KIND.FILE;
  return n.children.some((c) => !isLeaf(c)) ? NODE_KIND.PARENT : NODE_KIND.FOLDER;
}

function addInto(total, part) {
  total.files += part.files;
  total.weight += part.weight;
  total.edits += part.edits;
  total.touched += part.touched;
  total.heat += part.heat;
}

const editsOf = (n, editsByPath) => editsByPath.get(filePathKey(n.data.path || '')) || 0;

function fileAggregate(n, { weights, editsByPath, scale }) {
  const edits = editsOf(n, editsByPath);
  return { files: 1, weight: nodeWeight(n.data, weights), edits, touched: edits > 0 ? 1 : 0, heat: Math.min(1, edits / scale) };
}

function aggregate(root, input) {
  const agg = new Map();
  root.eachAfter((n) => {
    if (isLeaf(n)) {
      agg.set(n, fileAggregate(n, input));
      return;
    }
    const a = { files: 0, weight: 0, edits: 0, touched: 0, heat: 0 };
    for (const c of n.children) addInto(a, agg.get(c));
    agg.set(n, a);
  });
  return agg;
}

function statsOf(n, a) {
  const d = n.data;
  const sev = d.severity || {};
  return { violations: d.violations || 0, compliance: d.compliance || 0, weight: a.weight, files: a.files, critical: sev.critical || 0, major: sev.major || 0 };
}

function pageBg(palette) {
  return palette.dark ? palette.bg : palette.surfaceAlt;
}

/**
 * A folder's outline, the same rule in both themes on the theme's own base (the glass veil colour in
 * dark, the text colour in light): mixed with the folder's hue, more when it glows, fading with the glow,
 * and almost gone on a wrapper folder.
 */
function strokeFor(n, hue, palette, glow = 0) {
  const base = palette.dark ? palette.glassParent : palette.text;
  const mix = glow > 0 ? GLOW_STROKE_MIX : STROKE_MIX;
  const alpha = isPassThrough(n) ? WRAPPER_STROKE_ALPHA : STROKE_ALPHA * (1 - GLOW_STROKE_FADE * glow);
  return { stroke: rgbCss(mixRgb(base, hue, mix)), strokeAlpha: alpha };
}

/**
 * Glass in both themes: a folder holding files is its hue at `glassStrength` over the page, one holding
 * only sub-folders a faint veil; both cut out their sub-folders, which keep GLASS_HOLE_SHARE of the tint.
 */
function folderFill({ n, hue, glassStrength, palette }) {
  const holdsFiles = n.children.some(isLeaf);
  if (!holdsFiles) return { fill: rgbCss(palette.glassParent), alpha: GLASS_PARENT_ALPHA, cutOut: true, holeShare: GLASS_HOLE_SHARE };
  return { fill: rgbCss(hue), alpha: glassStrength, cutOut: true, holeShare: GLASS_HOLE_SHARE };
}

function concentrationPaint(n, ctx) {
  const kind = kindOf(n);
  const b = badness(statsOf(n, ctx.agg.get(n)), ctx.average, kind);
  const hue = badnessHue(b, ctx.palette);
  if (kind === NODE_KIND.FILE) {
    // Files better than average take the better hue, the rest their worst severity; folders show concentration.
    const worst = worstSeverity(n.data.severity || {});
    const fileHue = fileSeverityHue(worst, b, ctx.palette);
    return { fill: rgbCss(fileSeverityColor(worst, b, ctx.palette)), alpha: 1, cutOut: false, file: true, badness: b, hue: fileHue };
  }
  const fill = folderFill({ n, hue, glassStrength: badnessStrength(b, ctx.palette.dark) * GLASS_FOLDER_SCALE, palette: ctx.palette });
  // A folder that only wraps one sub-folder (src/main/java/...) is packaging: no glow, or a chain reads as an onion.
  const glow = isPassThrough(n) ? 0 : folderGlow(b);
  return { ...fill, file: false, badness: b, hue, glow };
}

function activityPaint(n, ctx) {
  const a = ctx.agg.get(n);
  const { palette } = ctx;
  if (isLeaf(n)) {
    const t = activityFileStrength(a.edits, ctx.scale);
    return { fill: rgbCss(mixRgb(palette.surfaceAlt, palette.activity, t)), alpha: 1, cutOut: false, file: true, badness: 0, hue: palette.activity };
  }
  const files = Math.max(1, a.files);
  const hue = a.touched / files <= ACTIVITY_IDLE_SHARE ? palette.activityIdle : palette.activity;
  const meanHeat = a.heat / files;
  const heat = kindOf(n) === NODE_KIND.PARENT ? Math.min(meanHeat, ACTIVITY_PARENT_HEAT_CAP) : meanHeat;
  const fill = folderFill({ n, hue, glassStrength: activityFolderStrength(heat), palette });
  return { ...fill, file: false, badness: 0, hue, glow: isPassThrough(n) ? 0 : activityGlow(heat) };
}

function rootPaint(palette) {
  // Dark mode raises the project circle one step above its frame: page bg < frame surface < circle surface-alt.
  return { fill: rgbCss(palette.dark ? palette.surfaceAlt : pageBg(palette)), alpha: 1, stroke: rgbCss(palette.border), strokeAlpha: 1, cutOut: true, file: false, outlineOnly: false, badness: 0, edits: 0 };
}

/**
 * Paint for every circle of a pack, computed once per tree, mode and theme.
 * @param {{root: object, circles: object[], mode: string, palette: object, weights: object, editsByPath: Map<string, number>}} input
 * @returns {object[]} one CirclePaint per circle, same order
 */
export function buildPackPaint({ root, circles, mode, palette, weights, editsByPath }) {
  const scale = activityScale(root.leaves().map((l) => editsOf(l, editsByPath)));
  const agg = aggregate(root, { weights, editsByPath, scale });
  const top = agg.get(root);
  const ctx = { agg, palette, scale, average: top.weight / Math.max(1, top.files) };
  const paintOf = mode === PACK_COLOR_MODE.ACTIVITY ? activityPaint : concentrationPaint;
  return circles.map((n) => {
    if (n === root) return rootPaint(palette);
    const p = paintOf(n, ctx);
    const outlineOnly = !isLeaf(n) && n.children.length === 1 && isLeaf(n.children[0]);
    return { ...p, ...strokeFor(n, p.hue, palette, p.glow), outlineOnly, edits: agg.get(n).edits };
  });
}
