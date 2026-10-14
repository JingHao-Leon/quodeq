import { skyAreas } from '../viz/core/skyLayout.js';
import { zoneOf } from '../viz/core/skyScale.js';
import { SKY_ZONE } from '../mapVocab.js';

/**
 * The areas the Risk tab puts in fix first or watch, most weighted issues per
 * file first (ties by name), each with its zone, and how many areas the sky
 * draws at all. The Map's measure, for other screens to list (the Overview).
 * @param {{areas: object[]}} areaSet decodeAreas output
 * @returns {{rows: {area: object, zone: string}[], total: number}}
 */
export function areasNeedingRework(areaSet) {
  const onSky = skyAreas(areaSet);
  const density = (a) => a.density || 0;
  const rows = onSky
    .map((a) => ({ area: a, zone: zoneOf(density(a)) }))
    .filter((r) => r.zone !== SKY_ZONE.HEALTHY)
    .sort((p, q) => density(q.area) - density(p.area) || p.area.name.localeCompare(q.area.name));
  return { rows, total: onSky.length };
}
