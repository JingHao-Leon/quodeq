import { badness } from './mapBadness.js';
import { mixRgb, rgbCss, badnessHue, badnessStrength, fileConcentrationColor, GLASS_FOLDER_SCALE } from './mapPaint.js';
import { GHOST_STROKE_ALPHA } from './packLayers.js';
import { AREA_KIND, NODE_KIND } from '../../mapVocab.js';

/** How an area's kind ring is drawn. */
export const RING_STYLE = Object.freeze({ SOLID: 'solid', DASHED: 'dashed' });
const STROKE_ALPHA = 0.3;

const RING_OF = new Map([[AREA_KIND.HOTSPOT, RING_STYLE.SOLID], [AREA_KIND.DORMANT, RING_STYLE.DASHED]]);

/**
 * An area bubble's colours: its Concentration colour against the run's
 * average (light solid over the page, dark glass), and its kind ring.
 * A ghost area (time-lapse: no file in the run shown) is a dotted outline only.
 * @param {{kind:string, stats:object, ghost?:boolean}} area
 * @param {number} average project severity weight per file
 * @param {object} palette readMapPalette output (with `dark`)
 * @returns {{fill:string, alpha:number, stroke:string, strokeAlpha:number, ring:string|null, ringColor:string, ghost?:boolean}}
 */
export function skyAreaPaint(area, average, palette) {
  if (area.ghost) {
    return { ghost: true, fill: rgbCss(palette.text), alpha: 0, stroke: rgbCss(palette.text), strokeAlpha: GHOST_STROKE_ALPHA, ring: null, ringColor: rgbCss(palette.worse) };
  }
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
 * A file dot's colour, the Circle Pack's file rule: its issues against the
 * project average, capped by its worst finding.
 * @param {{violations:number, compliance:number, weight:number, files:number, critical:number, major:number}} stats the file's own stats
 * @param {number} average project severity weight per file
 * @param {object} palette readMapPalette output (with `dark`)
 * @returns {string} CSS colour
 */
export function fileDotColor(stats, average, palette) {
  return rgbCss(fileConcentrationColor(badness(stats, average, NODE_KIND.FILE), palette));
}
