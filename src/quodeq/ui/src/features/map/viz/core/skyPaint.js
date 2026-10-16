import { badness } from './mapBadness.js';
import { mixRgb, rgbCss, badnessHue, badnessStrength, fileSeverityColor, GLASS_FOLDER_SCALE } from './mapPaint.js';
import { AREA_KIND, NODE_KIND } from '../../mapVocab.js';

/** How an area's kind ring is drawn. */
export const RING_STYLE = Object.freeze({ SOLID: 'solid', DASHED: 'dashed' });
const STROKE_ALPHA = 0.3;

const RING_OF = new Map([[AREA_KIND.HOTSPOT, RING_STYLE.SOLID], [AREA_KIND.DORMANT, RING_STYLE.DASHED]]);

/**
 * An area bubble's colours: its Concentration colour against the run's
 * average (light solid over the page, dark glass), and its kind ring.
 * @param {{kind:string, stats:object}} area
 * @param {number} average project severity weight per file
 * @param {object} palette readMapPalette output (with `dark`)
 * @returns {{fill:string, alpha:number, stroke:string, strokeAlpha:number, ring:string|null, ringColor:string}}
 */
export function skyAreaPaint(area, average, palette) {
  const b = badness(area.stats, average, NODE_KIND.FOLDER);
  const hue = badnessHue(b, palette);
  const strength = badnessStrength(b, palette.dark);
  const fill = palette.dark
    ? { fill: rgbCss(hue), alpha: strength * GLASS_FOLDER_SCALE }
    : { fill: rgbCss(mixRgb(palette.surfaceAlt, hue, strength)), alpha: 1 };
  return {
    ...fill,
    stroke: rgbCss(palette.text),
    strokeAlpha: STROKE_ALPHA,
    ring: RING_OF.get(area.kind) || null,
    ringColor: rgbCss(palette.worse),
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
