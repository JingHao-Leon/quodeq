import { zoneOf } from '../viz/core/skyScale.js';
import { skyAreas } from '../viz/core/skyLayout.js';
import { AREA_KIND, SKY_ZONE } from '../mapVocab.js';

const density = (a) => a.density || 0;
// Lift orders a selection's areas within a zone; without one (lift null) density does.
const liftOf = (a) => a.lift ?? density(a);
/** Zones in reading order: fix first, watch, healthy; an area too small to judge (no zone) last. */
const ZONE_RANK = Object.freeze({ [SKY_ZONE.FIX_FIRST]: 0, [SKY_ZONE.WATCH]: 1, [SKY_ZONE.HEALTHY]: 2 });
const NO_ZONE_RANK = Object.keys(ZONE_RANK).length;
const zoneRank = (row) => ZONE_RANK[row.zone] ?? NO_ZONE_RANK;
const NEEDS_REWORK = new Set([SKY_ZONE.FIX_FIRST, SKY_ZONE.WATCH]);

/**
 * Worst first: by zone on the absolute lines (fix first, watch, healthy,
 * too small last), within a zone by lift (the selection's ordering and
 * emphasis, never its zone), then density, then name.
 */
function byNeed(p, q) {
  return zoneRank(p) - zoneRank(q) || liftOf(q) - liftOf(p) || density(q) - density(p) || p.name.localeCompare(q.name);
}

/**
 * One area as other screens list it: its zone on the Risk sky (null when too
 * small to judge), density, lift, file count and issues per severity.
 * @param {object} area a decodeAreas area
 * @returns {{name: string, kind: string, zone: string|null, density: number, lift: number|null, files: number, severities: {critical: number, major: number, minor: number}}}
 */
function rankedArea(area) {
  const { files, violations, critical, major } = area.stats;
  return {
    name: area.name,
    kind: area.kind,
    zone: area.kind === AREA_KIND.SMALL ? null : zoneOf(density(area)),
    density: density(area),
    lift: area.lift,
    files,
    severities: { critical, major, minor: violations - critical - major },
  };
}

/**
 * The areas the Risk sky draws, worst first (byNeed): fix first, then watch,
 * then healthy, each by lift; those too small to judge last.
 * @param {{areas: object[]}} areaSet decodeAreas output
 * @returns {object[]} rankedArea rows
 */
export function rankedAreas(areaSet) {
  return skyAreas(areaSet).map(rankedArea).sort(byNeed);
}

/**
 * What a list of the areas needing rework shows: the ranked areas in the fix
 * first and watch zones, how many of each, and how many areas the sky draws.
 * @param {object[]} ranked rankedAreas output
 * @returns {{rows: object[], fixFirst: number, watch: number, total: number}}
 */
export function reworkSummary(ranked) {
  const rows = ranked.filter((a) => NEEDS_REWORK.has(a.zone));
  const fixFirst = rows.filter((a) => a.zone === SKY_ZONE.FIX_FIRST).length;
  return { rows, fixFirst, watch: rows.length - fixFirst, total: ranked.length };
}
