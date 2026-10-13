import { densityTop, layoutSky, layoutSkyFrom, ringsAt, skyAreas } from './skyLayout.js';
import { absenceIn, cachedRuns } from './timelapseScene.js';

const NO_STATS = Object.freeze({ violations: 0, compliance: 0, weight: 0, files: 0, critical: 0, major: 0 });
/** Full area sets kept at once: the two runs of a move plus a little slack for scrubbing. */
export const SKY_SCENE_CACHE_SIZE = 4;

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

/**
 * What the layout needs of a run, without its files: each area's density and
 * file count by name, the names that are bubbles, and the run's average.
 */
function runSummary(set) {
  const areas = new Map(set.areas.map((a) => [a.name, { name: a.name, density: a.density, stats: { files: a.stats.files } }]));
  return { areas, bubbles: skyAreas(set).map((a) => a.name), average: set.average };
}

/** The history's scale top: the densest present instance of any area on the sky. */
function historyTop(summaries, names) {
  return densityTop(summaries.flatMap(({ areas }) => names.filter((n) => areas.has(n)).map((n) => areas.get(n))));
}

/**
 * Bubble positions per run, settled in order, each from the run before, under
 * one top; computed up to the run asked for and kept (a few dozen per run).
 * @returns {function(number): Map<string, {x: number, y: number, r: number}>}
 */
function settledRuns(summaries, names, top) {
  const present = summaries.map((s) => s.areas);
  const nodes = [];
  return (k) => {
    for (let j = nodes.length; j <= k; j++) {
      const areas = names.map((name) => present[j].get(name) || ghostArea(name, nearestDensity(present, name, j)));
      const laid = j ? layoutSkyFrom(areas, nodes[j - 1], top) : layoutSky(areas, top);
      nodes.push(new Map(areas.map((a, i) => [a.name, laid[i]])));
    }
    return nodes[k];
  };
}

/**
 * The Risk sky of every run (plan Decision 11): every area that is a bubble in
 * some run is on every run's sky, dotted where it has no file; each run
 * settles from the run before it. One scale top over the whole history keeps
 * the targets and the rings still while the runs play. Only per-run area
 * summaries and positions are kept for the whole history; a run's full area
 * set (with its file dots) is rebuilt on demand for the last few runs asked.
 * @param {function(number): {areas: object[], average: number}} areaSetAt run k's area set
 * @param {{day: string}[]} runs the history's runs, oldest first
 * @returns {{rings: {fixFirst: number, watch: number},
 *   sceneAt: function(number): {areas: object[], average: number, rings: object, nodes: Map<string, {x: number, y: number, r: number}>},
 *   absenceAt: function(number, string): ({kind: string, day: string}|null)}}
 */
export function createSkyTimeline(areaSetAt, runs) {
  const summaries = runs.map((_, k) => runSummary(areaSetAt(k)));
  const present = summaries.map((s) => s.areas);
  const names = [...new Set(summaries.flatMap((s) => s.bubbles))].sort();
  const top = historyTop(summaries, names);
  const rings = ringsAt(top);
  const nodesAt = settledRuns(summaries, names, top);
  const empty = Object.freeze({ areas: [], average: 0, rings, nodes: new Map() });
  const sceneOf = cachedRuns((k) => {
    const full = new Map(areaSetAt(k).areas.map((a) => [a.name, a]));
    const areas = names.map((name) => full.get(name) || ghostArea(name, nearestDensity(present, name, k)));
    return { areas, average: summaries[k].average, rings, nodes: nodesAt(k) };
  }, SKY_SCENE_CACHE_SIZE);
  return {
    rings,
    sceneAt: (k) => (k >= 0 && k < runs.length ? sceneOf(k) : empty),
    absenceAt: (k, name) => absenceIn(runs, k, (j) => Boolean(present[j]?.has(name))),
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
