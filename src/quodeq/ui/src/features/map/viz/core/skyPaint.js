import { badness } from './mapBadness.js';
import { mixRgb, rgbCss, badnessHue, badnessStrength, GLASS_FOLDER_SCALE } from './mapPaint.js';
import { AREA_KIND, NODE_KIND } from '../../mapVocab.js';
import { SEVERITY } from '../../../../vocab/severity.js';

/** How an area's kind ring is drawn. */
export const RING_STYLE = Object.freeze({ SOLID: 'solid', DASHED: 'dashed' });
const STROKE_ALPHA = 0.3;

const RING_OF = new Map([[AREA_KIND.HOTSPOT, RING_STYLE.SOLID], [AREA_KIND.DORMANT, RING_STYLE.DASHED]]);
const DOT_KEY = new Map([[SEVERITY.CRITICAL, 'sevCritical'], [SEVERITY.MAJOR, 'sevMajor'], [SEVERITY.MINOR, 'sevMinor']]);

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
 * A file dot's colour: its worst violation, or the neutral hue when it has none.
 * @param {string|null} worst a SEVERITY value or null
 * @param {object} palette readMapPalette output
 * @returns {string} CSS colour
 */
export function dotColor(worst, palette) {
  return rgbCss(palette[DOT_KEY.get(worst)] || palette.neutral);
}
