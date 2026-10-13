import { densityTop, layoutSky, layoutSkyFrom, ringsAt, skyAreas } from './skyLayout.js';
import { absenceIn } from './timelapseScene.js';

const NO_STATS = Object.freeze({ violations: 0, compliance: 0, weight: 0, files: 0, critical: 0, major: 0 });

/** An area with no file in a run: a small dotted bubble at its nearest known density. */
function ghostArea(name, density) {
  return { name, ghost: true, kind: null, density, touchedShare: 0, layers: [], dots: [], stats: NO_STATS };
}

/** The area's density in the nearest run that has it, earlier runs first on a tie. */
function nearestDensity(present, name, k) {
  for (let d = 1; d < present.length; d++) {
    const hit = present[k - d]?.get(name) || present[k + d]?.get(name);
    if (hit) return hit.density;
  }
  return 0;
}

/** Every area that is a bubble in some run, by name. */
function everyBubbleName(sets) {
  return [...new Set(sets.flatMap((set) => skyAreas(set).map((a) => a.name)))].sort();
}

/**
 * The Risk sky of every run (plan Decision 11): every area that is a bubble in
 * some run is on every run's sky, dotted where it has no file; each run
 * settles from the run before it. One scale top over the whole history keeps
 * the targets and the rings still while the runs play. Scenes are computed in
 * order, on demand, and kept.
 * @param {function(number): {areas: object[], average: number}} areaSetAt run k's area set
 * @param {{day: string}[]} runs the history's runs, oldest first
 * @returns {{rings: {fixFirst: number, watch: number},
 *   sceneAt: function(number): {areas: object[], average: number, rings: object, nodes: Map<string, {x: number, y: number, r: number}>},
 *   absenceAt: function(number, string): ({kind: string, day: string}|null)}}
 */
export function createSkyTimeline(areaSetAt, runs) {
  const sets = runs.map((_, k) => areaSetAt(k));
  const present = sets.map((set) => new Map(set.areas.map((a) => [a.name, a])));
  const names = everyBubbleName(sets);
  const top = densityTop(present.flatMap((byName) => names.filter((n) => byName.has(n)).map((n) => byName.get(n))));
  const rings = ringsAt(top);
  const scenes = [];
  const areasOf = (k) => names.map((name) => present[k].get(name) || ghostArea(name, nearestDensity(present, name, k)));
  return {
    rings,
    sceneAt(k) {
      for (let j = scenes.length; j <= k; j++) {
        const areas = areasOf(j);
        const laid = j ? layoutSkyFrom(areas, scenes[j - 1].nodes, top) : layoutSky(areas, top);
        scenes.push({ areas, average: sets[j].average, rings, nodes: new Map(areas.map((a, i) => [a.name, laid[i]])) });
      }
      return scenes[k];
    },
    absenceAt(k, name) {
      return absenceIn(runs, k, (j) => present[j].has(name));
    },
  };
}

/**
 * Bubble positions and radii between two runs' skies, aligned with `areas`
 * (every name is in both). At `t >= 1` it is exactly the target, so the end
 * of a move never pops.
 * @param {{name: string}[]} areas the target run's areas
 * @param {Map<string, {x: number, y: number, r: number}>} fromNodes
 * @param {Map<string, {x: number, y: number, r: number}>} toNodes
 * @param {number} t progress, 0..1
 * @returns {{x: number, y: number, r: number}[]}
 */
export function lerpSkyNodes(areas, fromNodes, toNodes, t) {
  return areas.map(({ name }) => {
    const a = fromNodes.get(name);
    const b = toNodes.get(name);
    if (t >= 1) return { x: b.x, y: b.y, r: b.r };
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t };
  });
}
