import { badness, nodeWeight } from './mapBadness.js';
import {
  mixRgb, rgbCss, badnessHue, badnessStrength, fileStrength, activityScale, activityFileStrength,
  activityFolderStrength, GLASS_FOLDER_SCALE, GLASS_PARENT_ALPHA, ACTIVITY_IDLE_SHARE, STROKE_MIX,
} from './mapPaint.js';
import { NODE_KIND, PACK_COLOR_MODE } from '../../mapVocab.js';

const STROKE_ALPHA = 0.22;
const STROKE_ALPHA_TOP = 0.3;    // light: the first ring of folders reads a little stronger

const isLeaf = (n) => !n.children?.length;

function kindOf(n) {
  if (isLeaf(n)) return NODE_KIND.FILE;
  return n.children.some((c) => !isLeaf(c)) ? NODE_KIND.PARENT : NODE_KIND.FOLDER;
}

function addInto(total, part) {
  total.files += part.files;
  total.weight += part.weight;
  total.edits += part.edits;
  total.touched += part.touched;
}

function aggregate(root, weights, editsByPath) {
  const agg = new Map();
  root.eachAfter((n) => {
    if (isLeaf(n)) {
      const edits = editsByPath.get(n.data.path) || 0;
      agg.set(n, { files: 1, weight: nodeWeight(n.data, weights), edits, touched: edits > 0 ? 1 : 0 });
      return;
    }
    const a = { files: 0, weight: 0, edits: 0, touched: 0 };
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

function strokeFor(n, hue, palette) {
  if (palette.dark) return { stroke: rgbCss(mixRgb(palette.glassParent, hue, STROKE_MIX)), strokeAlpha: STROKE_ALPHA };
  return { stroke: rgbCss(palette.text), strokeAlpha: n.depth === 1 ? STROKE_ALPHA_TOP : STROKE_ALPHA };
}

function folderFill({ n, hue, strength, glassStrength, palette }) {
  if (!palette.dark) return { fill: rgbCss(mixRgb(pageBg(palette), hue, strength)), alpha: 1, cutOut: true };
  const holdsFiles = n.children.some(isLeaf);
  if (!holdsFiles) return { fill: rgbCss(palette.glassParent), alpha: GLASS_PARENT_ALPHA, cutOut: false };
  return { fill: rgbCss(hue), alpha: glassStrength, cutOut: false };
}

function concentrationPaint(n, ctx) {
  const kind = kindOf(n);
  const b = badness(statsOf(n, ctx.agg.get(n)), ctx.average, kind);
  const hue = badnessHue(b, ctx.palette);
  if (kind === NODE_KIND.FILE) return { fill: rgbCss(mixRgb(ctx.palette.bg, hue, fileStrength(b, ctx.palette.dark))), alpha: 1, cutOut: false, file: true, badness: b, hue };
  const strength = badnessStrength(b, ctx.palette.dark);
  return { ...folderFill({ n, hue, strength, glassStrength: strength * GLASS_FOLDER_SCALE, palette: ctx.palette }), file: false, badness: b, hue };
}

function activityPaint(n, ctx) {
  const a = ctx.agg.get(n);
  const { palette } = ctx;
  if (isLeaf(n)) {
    const t = activityFileStrength(a.edits, ctx.scale);
    return { fill: rgbCss(mixRgb(palette.surfaceAlt, palette.activity, t)), alpha: 1, cutOut: false, file: true, badness: 0, hue: palette.activity };
  }
  const share = a.touched / Math.max(1, a.files);
  const hue = palette.dark && share <= ACTIVITY_IDLE_SHARE ? palette.activityIdle : palette.activity;
  const fill = folderFill({ n, hue, strength: activityFolderStrength(share, false), glassStrength: activityFolderStrength(share, true), palette });
  return { ...fill, file: false, badness: 0, hue };
}

function rootPaint(palette) {
  return { fill: rgbCss(pageBg(palette)), alpha: 1, stroke: rgbCss(palette.border), strokeAlpha: 1, cutOut: true, file: false, outlineOnly: false, badness: 0, edits: 0 };
}

/**
 * Paint for every circle of a pack, computed once per tree, mode and theme.
 * @param {{root: object, circles: object[], mode: string, palette: object, weights: object, editsByPath: Map<string, number>}} input
 * @returns {object[]} one CirclePaint per circle, same order
 */
export function buildPackPaint({ root, circles, mode, palette, weights, editsByPath }) {
  const agg = aggregate(root, weights, editsByPath);
  const top = agg.get(root);
  const ctx = {
    agg, palette,
    average: top.weight / Math.max(1, top.files),
    scale: activityScale(root.leaves().map((l) => agg.get(l).edits)),
  };
  const paintOf = mode === PACK_COLOR_MODE.ACTIVITY ? activityPaint : concentrationPaint;
  return circles.map((n) => {
    if (n === root || n.depth === 0) return rootPaint(palette);
    const p = paintOf(n, ctx);
    const outlineOnly = !isLeaf(n) && n.children.length === 1 && isLeaf(n.children[0]);
    return { ...p, ...strokeFor(n, p.hue, palette), outlineOnly, edits: agg.get(n).edits };
  });
}
