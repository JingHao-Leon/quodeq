import { clamp } from './mapBadness.js';
import { SKY_ZONE } from '../../mapVocab.js';
import { FIX_FIRST_DENSITY, WATCH_DENSITY, zoneOf } from '../../../../models/riskRules.js';

// The zones' thresholds and the zone of a density are the shared Risk measure (models/riskRules.js).
export { FIX_FIRST_DENSITY, WATCH_DENSITY, zoneOf };

/**
 * The Risk sky's scale: how big a bubble is, which zone an area's density
 * puts it in, where the fix-first and watch rings fall for a set of areas,
 * and how far from the centre an area sits inside its zone.
 */

/** Distance from the centre: the densest areas at NEED_INNER (at most), areas with no findings at NEED_OUTER. */
const NEED_INNER = 0.12;
const NEED_OUTER = 0.84;
/**
 * The lowest the scale top goes: twice the fix-first density, so the
 * fix-first ring never sits on the centre and areas past it keep room to
 * spread inside it.
 */
export const SCALE_FLOOR = 2 * FIX_FIRST_DENSITY;
const R_BASE = 0.014;
const R_PER_SQRT_FILE = 0.0068;
/** Empty space kept between neighbouring bubbles, in sky-radius units. */
export const SKY_GAP = 0.012;
const HALF = 0.5;

/**
 * A bubble's radius from its file count.
 * @param {number} files file count
 * @returns {number} radius in sky-radius units
 */
export function bubbleRadius(files) {
  return R_BASE + Math.sqrt(Math.max(0, files)) * R_PER_SQRT_FILE;
}

/**
 * The share of the areas the scale top covers: one extreme area cannot push
 * every other area to the rim, it sits at the centre with the top's own.
 */
export const SKY_TOP_PERCENTILE = 0.9;

/** The p-quantile of ascending values, interpolated between the two nearest ranks. */
function quantile(sorted, p) {
  const at = (sorted.length - 1) * p;
  const below = Math.floor(at);
  const above = Math.min(sorted.length - 1, below + 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

/**
 * How far above the second-densest area the scale top may reach. One runaway
 * area may not stretch the scale for every other area; with few areas the
 * percentile sits next to the max and cannot hold it back on its own.
 */
export const OUTLIER_CAP = 2;

/**
 * The density the sky's scale tops out at: the SKY_TOP_PERCENTILE of the
 * areas' densities, capped at OUTLIER_CAP times the second-densest area (when
 * there is one), never below SCALE_FLOOR, so a clean project keeps its
 * areas off the centre and its fix-first ring clear of it. Areas above it sit at the innermost distance.
 * skyScale uses it for the fix-first circle's inside.
 * @param {{density: number}[]} areas
 * @returns {number} weighted findings per file
 */
export function densityTop(areas) {
  if (!areas.length) return SCALE_FLOOR;
  const sorted = areas.map((a) => a.density || 0).sort((a, b) => a - b);
  const percentile = quantile(sorted, SKY_TOP_PERCENTILE);
  const capped = sorted.length > 1 ? Math.min(percentile, OUTLIER_CAP * sorted[sorted.length - 2]) : percentile;
  return Math.max(SCALE_FLOOR, capped);
}

/**
 * The rings take the room their areas need: the fix-first circle and the
 * watch ring each cover the share of the sky (by area) that their bubbles
 * take of all the bubbles. A ring that holds areas never sits inside these
 * radii (sky-radius units), so a few areas still get room; an empty
 * fix-first circle closes in to EMPTY_FIX_FIRST around the centre. The watch
 * band and the healthy band keep a minimum width.
 */
export const MIN_FIX_FIRST = 0.25;
export const EMPTY_FIX_FIRST = 0.1;
export const MIN_WATCH = 0.5;
const MIN_WATCH_BAND = 0.1;
const MIN_HEALTHY_BAND = 0.12;

/** How much room a bubble asks of its zone: its padded area (any common scale gives the same shares). */
const roomOf = (area) => (bubbleRadius(area.stats.files) + SKY_GAP * HALF) ** 2;

/**
 * The sky's scale for these areas: the density top (for the fix-first
 * circle's inside) and where the two rings fall, each zone as big as its
 * areas need (by bubble area), with the minimum widths above.
 * @param {{density: number, stats: {files: number}}[]} areas
 * @returns {{top: number, fixFirst: number, watch: number, counts: {fixFirst: number, watch: number}}}
 *   the top in weighted findings per file, the rings in sky-radius units, and how many areas each ring holds
 */
export function skyScale(areas) {
  const room = { fix: 0, watch: 0, all: 0 };
  const counts = { fixFirst: 0, watch: 0 };
  for (const a of areas) {
    const r = roomOf(a);
    const zone = zoneOf(a.density || 0);
    room.all += r;
    if (zone === SKY_ZONE.FIX_FIRST) { room.fix += r; counts.fixFirst++; }
    if (zone === SKY_ZONE.WATCH) { room.watch += r; counts.watch++; }
  }
  const share = (v) => (room.all > 0 ? v / room.all : 0);
  const fixFirst = room.fix > 0
    ? clamp(NEED_OUTER * Math.sqrt(share(room.fix)), MIN_FIX_FIRST, NEED_OUTER - MIN_WATCH_BAND - MIN_HEALTHY_BAND)
    : EMPTY_FIX_FIRST;
  const watchFloor = room.watch > 0 ? Math.max(MIN_WATCH, fixFirst + MIN_WATCH_BAND) : fixFirst + MIN_WATCH_BAND;
  const watch = clamp(NEED_OUTER * Math.sqrt(share(room.fix + room.watch)), watchFloor, NEED_OUTER - MIN_HEALTHY_BAND);
  return { top: densityTop(areas), fixFirst, watch, counts };
}

/**
 * Where the "fix first" and "watch" rings fall for these areas: each zone as
 * big as the areas in it need, so the rings follow the project.
 * @param {{density: number, stats: {files: number}}[]} areas
 * @returns {{fixFirst: number, watch: number, counts: {fixFirst: number, watch: number}}} distances in sky-radius units, and the areas in each
 */
export function skyRings(areas) {
  const { fixFirst, watch, counts } = skyScale(areas);
  return { fixFirst, watch, counts };
}

/**
 * How far from the centre an area with this density sits, inside its zone:
 * past fix first, from the fix-first ring in toward the centre as it nears
 * the top (a density above the top is clamped to it); in watch, across the
 * band; healthy, from the watch ring out to the rim. The square roots spread
 * the many low-density areas across their band instead of stacking them on
 * the rim, and still compress a heavy tail.
 * @param {number} density weighted findings per file
 * @param {{top: number, fixFirst: number, watch: number}} scale skyScale of the areas
 * @returns {number} distance in sky-radius units
 */
export function densityDistance(density, { top, fixFirst, watch }) {
  if (density >= FIX_FIRST_DENSITY) {
    const inner = Math.min(NEED_INNER, fixFirst * HALF);
    return fixFirst - Math.sqrt(clamp((density - FIX_FIRST_DENSITY) / (top - FIX_FIRST_DENSITY), 0, 1)) * (fixFirst - inner);
  }
  if (density >= WATCH_DENSITY) return watch - ((density - WATCH_DENSITY) / (FIX_FIRST_DENSITY - WATCH_DENSITY)) * (watch - fixFirst);
  return watch + (1 - Math.sqrt(clamp(density / WATCH_DENSITY, 0, 1))) * (NEED_OUTER - watch);
}
