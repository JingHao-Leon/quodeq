import { badness } from './mapBadness.js';
import { mixRgb, rgbCss, badnessHue, badnessStrength, fileSeverityColor } from './mapPaint.js';
import { clamp } from './mapBadness.js';
import { AREA_KIND, NODE_KIND } from '../../mapVocab.js';

/** How an area's kind ring is drawn. */
export const RING_STYLE = Object.freeze({ SOLID: 'solid', DASHED: 'dashed' });
const STROKE_ALPHA = 0.3;
/**
 * A bubble is one solid colour (its file dots show on hover), so it needs more of its hue
 * than a translucent pack folder: this share plus SOLID_GAIN times the folder strength.
 */
const SOLID_BASE = 0.2;
const SOLID_GAIN = 1.2;

const RING_OF = new Map([[AREA_KIND.HOTSPOT, RING_STYLE.SOLID], [AREA_KIND.DORMANT, RING_STYLE.DASHED]]);

/**
 * An area bubble's colours: its Concentration colour against the run's
 * average, one solid colour over the page (dark) or the panel (light), and its kind ring.
 * @param {{kind:string, stats:object}} area
 * @param {number} average project severity weight per file
 * @param {object} palette readMapPalette output (with `dark`)
 * @returns {{fill:string, alpha:number, stroke:string, strokeAlpha:number, ring:string|null, ringColor:string, hue:{r:number,g:number,b:number}}}
 */
export function skyAreaPaint(area, average, palette) {
  const b = badness(area.stats, average, NODE_KIND.FOLDER);
  const hue = badnessHue(b, palette);
  const share = clamp(SOLID_BASE + SOLID_GAIN * badnessStrength(b, palette.dark), 0, 1);
  return {
    fill: rgbCss(mixRgb(palette.dark ? palette.bg : palette.surfaceAlt, hue, share)),
    alpha: 1,
    stroke: rgbCss(palette.text),
    strokeAlpha: STROKE_ALPHA,
    ring: RING_OF.get(area.kind) || null,
    ringColor: rgbCss(palette.worse),
    hue,
  };
}

/**
 * A file dot's colour, the Circle Pack's file rule: its worst finding's
 * colour, stronger the more its issues weigh against the project average.
 * @param {{violations:number, compliance:number, weight:number, files:number, critical:number, major:number}} stats the file's own stats
 * @param {number} average project severity weight per file
 * @param {object} palette readMapPalette output (with `dark`)
 * @returns {string} CSS colour
 */
export function fileDotColor(stats, average, palette) {
  return rgbCss(fileSeverityColor(worstOfStats(stats), badness(stats, average, NODE_KIND.FILE), palette));
}

/** The worst severity a file's stats hold (they count critical and major; the rest of its violations are minor). */
export function worstOfStats(stats) {
  if (stats.critical > 0) return 'critical';
  if (stats.major > 0) return 'major';
  return stats.violations > 0 ? 'minor' : null;
}
