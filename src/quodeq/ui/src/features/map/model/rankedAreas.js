import { zoneOf } from '../viz/core/skyScale.js';
import { AREA_KIND } from '../mapVocab.js';

const density = (a) => a.density || 0;
// Lift orders a selection's areas; without one (lift null) density does.
const liftOf = (a) => a.lift ?? density(a);

/** Worst first: highest lift, then highest density, then by name. */
function byNeed(p, q) {
  return liftOf(q) - liftOf(p) || density(q) - density(p) || p.name.localeCompare(q.name);
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
 * Every area of a set, worst first: by lift (a selection's ordering, never
 * its zones), then density, then name.
 * @param {{areas: object[]}} areaSet decodeAreas output
 * @returns {object[]} rankedArea rows
 */
export function rankedAreas(areaSet) {
  return [...areaSet.areas].sort(byNeed).map(rankedArea);
}
