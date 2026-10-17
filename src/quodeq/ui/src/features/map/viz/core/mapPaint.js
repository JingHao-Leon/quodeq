import { clamp, AVERAGE_BAND } from './mapBadness.js';

const WORSE_EXP = 1.35;
const WORSE_BASE = { dark: 0.06, light: 0.04 };
const WORSE_SPAN = { dark: 0.46, light: 0.5 };
const BETTER_EXP = { dark: 1.3, light: 1 };
const BETTER_BASE = { dark: 0.05, light: 0.04 };
const BETTER_SPAN = { dark: 0.34, light: 0.16 };
/** How far a file's colour moves from the page toward its hue, the same band in both themes. */
const FILE_BAND = { base: 0.45, span: 0.55, min: 0.4, max: 1 };
const ACTIVITY_SCALE_MIN = 2;
const ACTIVITY_QUANTILE = 0.9;
// A changed file starts faint and reaches full colour only at "changed often" (the scale), linearly,
// so on a project where most files were touched at some point only the busy ones stand out.
const ACT_FILE_BASE = 0.15;
const ACT_FILE_SPAN = 0.85;
const ACT_FOLDER = { base: 0.04, span: 0.24, exp: 0.8 };

/** Glass: a folder holding files shows its colour at 85 % of the solid strength. */
export const GLASS_FOLDER_SCALE = 0.85;
/** Glass: a folder holding only sub-folders gets this faint neutral veil. */
export const GLASS_PARENT_ALPHA = 0.05;
/**
 * Glass: the share of a folder's tint that still shows under its sub-folders. Full (1) let tints
 * stack with depth; none (0) left bad parents' sub-folders looking hollow. A little keeps them inside.
 */
export const GLASS_HOLE_SHARE = 0.35;
/** A folder whose share of changed files is below this reads as idle in Activity. */
export const ACTIVITY_IDLE_SHARE = 0.02;
/** Activity: a folder with sub-folders shows at most this heat, a tint and never a flood. */
export const ACTIVITY_PARENT_HEAT_CAP = 0.25;
/** Glass outlines mix the theme base with the node hue at this share. */
export const STROKE_MIX = 0.35;

const side = (dark) => (dark ? 'dark' : 'light');

/** Linear mix of two colours, `t` = share of `b`, rounded to whole channels. */
export function mixRgb(a, b, t) {
  const k = clamp(t, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

/** CSS colour string for a canvas fill or stroke. */
export function rgbCss({ r, g, b }) {
  return `rgb(${r}, ${g}, ${b})`;
}

/** The hue of a badness value: worse, better, or neutral near zero. */
export function badnessHue(b, palette) {
  if (b > AVERAGE_BAND) return palette.worse;
  return b < -AVERAGE_BAND ? palette.better : palette.neutral;
}

/** Folder fill strength for a badness value; the worse side grows faster so problems lead. */
export function badnessStrength(b, dark) {
  const s = side(dark);
  const t = Math.abs(b);
  if (b >= 0) return WORSE_BASE[s] + WORSE_SPAN[s] * t ** WORSE_EXP;
  return BETTER_BASE[s] + BETTER_SPAN[s] * t ** BETTER_EXP[s];
}

/** A better-than-average folder glows at this share of a worse one with the same distance from average. */
const BETTER_GLOW_SHARE = 0.8;

/**
 * How strongly a folder glows in its own hue, 0 to 1 (both themes): worse than average
 * up to 1, better than average up to BETTER_GLOW_SHARE, about average not at all. It
 * follows the folder's own score, so depth never adds glow (the fills are cut out).
 */
export function folderGlow(b) {
  if (Math.abs(b) <= AVERAGE_BAND) return 0;
  if (b > 0) return clamp(badnessStrength(b, true) / (WORSE_BASE.dark + WORSE_SPAN.dark), 0, 1);
  return BETTER_GLOW_SHARE * clamp(badnessStrength(b, true) / (BETTER_BASE.dark + BETTER_SPAN.dark), 0, 1);
}

/** How far a file's colour moves from the background toward its hue. */
export function fileStrength(b) {
  return clamp(FILE_BAND.base + FILE_BAND.span * Math.abs(b), FILE_BAND.min, FILE_BAND.max);
}

/**
 * A file circle's Concentration colour: its badness hue mixed into the page
 * background by its file strength. Shared by the Circle Pack and the Risk sky.
 * @param {number} b the file's badness
 * @param {object} palette readMapPalette output (with `dark`)
 * @returns {{r:number, g:number, b:number}}
 */
export function fileConcentrationColor(b, palette) {
  return mixRgb(palette.bg, badnessHue(b, palette), fileStrength(b));
}

const SEVERITY_HUE_KEY = Object.freeze({ critical: 'sevCritical', major: 'sevMajor', minor: 'sevMinor' });

/**
 * A file's hue: better than average (clean files included) takes the better
 * hue, otherwise the severity colour of its worst finding.
 */
export function fileSeverityHue(worst, b, palette) {
  if (b < -AVERAGE_BAND || !worst) return badnessHue(b, palette);
  return palette[SEVERITY_HUE_KEY[worst]] ?? palette.neutral;
}

/** A file in the Circle Pack: its hue, stronger the further its findings sit from the average. */
export function fileSeverityColor(worst, b, palette) {
  return mixRgb(palette.bg, fileSeverityHue(worst, b, palette), fileStrength(b));
}

/** Edits that count as "changed often": the 90th percentile of edited files, at least 2. */
export function activityScale(editCounts) {
  const edited = editCounts.filter((n) => n > 0).sort((a, b) => a - b);
  const p90 = edited[Math.floor(edited.length * ACTIVITY_QUANTILE)] ?? edited[edited.length - 1] ?? 0;
  return Math.max(ACTIVITY_SCALE_MIN, p90);
}

/** Activity colour strength of a file: 0 when unchanged, then a linear ramp up to 1 at the scale. */
export function activityFileStrength(edits, scale) {
  if (!edits) return 0;
  return ACT_FILE_BASE + ACT_FILE_SPAN * Math.min(1, edits / scale);
}

/** Activity: a folder glows once its heat passes this, so only the busy ones do. */
const ACTIVITY_GLOW_FROM = 0.15;

/**
 * Activity: how strongly a folder glows in the activity colour, 0 to 1, from its heat (mean
 * per-file edits against the scale), as Concentration's from its score. Both themes: in light the
 * glow is what lifts a busy folder off the neutral quiet ones.
 */
export function activityGlow(heat) {
  if (heat <= ACTIVITY_GLOW_FROM) return 0;
  return clamp((heat - ACTIVITY_GLOW_FROM) / (1 - ACTIVITY_GLOW_FROM), 0, 1);
}

/** Activity glass strength of a folder from its heat (mean per-file edits against the scale, 0..1), both themes. */
export function activityFolderStrength(heat) {
  return ACT_FOLDER.base + ACT_FOLDER.span * clamp(heat, 0, 1) ** ACT_FOLDER.exp;
}

const WHITE = Object.freeze({ r: 255, g: 255, b: 255 });
const BLACK = Object.freeze({ r: 0, g: 0, b: 0 });
/** How far canvas labels move from the theme's text colour toward full contrast. */
const LABEL_INK_SHARE = 0.6;

/** The colour of names drawn on a map canvas: the theme's text, pushed toward white (dark) or black (light) so small labels stay crisp. */
export function labelInk(palette) {
  return mixRgb(palette.text, palette.dark ? WHITE : BLACK, LABEL_INK_SHARE);
}
