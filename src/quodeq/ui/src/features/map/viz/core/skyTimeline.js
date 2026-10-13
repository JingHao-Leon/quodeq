import { densityTop, layoutSky, layoutSkyFrom, ringsAt, skyAreas } from './skyLayout.js';
import { absenceIn, cachedRuns } from './timelapseScene.js';

const NO_STATS = Object.freeze({ violations: 0, compliance: 0, weight: 0, files: 0, critical: 0, major: 0 });
/** Full area sets kept at once: the two runs of a move plus a little slack for scrubbing. */
export const SKY_SCENE_CACHE_SIZE = 4;

/** An area with no file in a run: a small dotted bubble at its nearest known density. */
function ghostArea(name, density) {
  return { name, ghost: true, kind: null, density, touchedShare: 0, layers: [], dots: [], stats: NO_STATS };
}

const NO_RUN = -1;

/**
 * Per run, the area's density in the nearest run that has it, earlier runs
 * first on a tie (0 when no run has it): one pass each way over the runs.
 */
function nearestDensities(present, name) {
  const n = present.length;
  const before = new Int32Array(n).fill(NO_RUN);
  for (let k = 1; k < n; k++) before[k] = present[k - 1].has(name) ? k - 1 : before[k - 1];
  const after = new Int32Array(n).fill(NO_RUN);
  for (let k = n - 2; k >= 0; k--) after[k] = present[k + 1].has(name) ? k + 1 : after[k + 1];
  return Array.from(before, (b, k) => {
    const a = after[k];
    const nearest = b === NO_RUN || (a !== NO_RUN && a - k < k - b) ? a : b;
    return nearest === NO_RUN ? 0 : present[nearest].get(name).density;
  });
}

/** The dotted stand-in of an area in a run that has no file of it, densities worked out once per area. */
function ghostAreas(present, names) {
  const densities = new Map(names.map((name) => [name, nearestDensities(present, name)]));
  return (name, k) => ghostArea(name, densities.get(name)[k]);
}

/**
 * What the layout needs of a run, without its files: each area's density and
 * file count by name, the names that are bubbles, and the run's average.
 */
function runSummary(set) {
  const areas = new Map(set.areas.map((a) => [a.name, { name: a.name, kind: a.kind, density: a.density, stats: { files: a.stats.files } }]));
  return { areas, bubbles: skyAreas(set).map((a) => a.name), average: set.average };
}

/** The history's scale top: densityTop (the live sky's rule) over every present instance of an area on the sky. */
function historyTop(summaries, names) {
  return densityTop(summaries.flatMap(({ areas }) => names.filter((n) => areas.has(n)).map((n) => areas.get(n))));
}

/** Every kind an area on the sky has in some run (a legend that holds still while the runs play). */
function historyKinds(summaries, names) {
  const kinds = summaries.flatMap(({ areas }) => names.map((n) => areas.get(n)?.kind));
  return [...new Set(kinds.filter(Boolean))];
}

/**
 * Bubble positions per run, settled in order, each from the run before, under
 * one top; computed up to the run asked for and kept (a few dozen per run).
 * @returns {{at: function(number): Map<string, {x: number, y: number, r: number}>, settled: function(): number}}
 */
function settledRuns(present, names, top, ghostAt) {
  const nodes = [];
  const at = (k) => {
    for (let j = nodes.length; j <= k; j++) {
      const areas = names.map((name) => present[j].get(name) || ghostAt(name, j));
      const laid = j ? layoutSkyFrom(areas, nodes[j - 1], top) : layoutSky(areas, top);
      nodes.push(new Map(areas.map((a, i) => [a.name, laid[i]])));
    }
    return nodes[k];
  };
  return { at, settled: () => nodes.length };
}

/**
 * What the whole history decides once every run is summarised: the names on
 * the sky, the scale top and its rings, the legend's kinds, and the chain of
 * settled runs.
 */
function historyOf(summaries) {
  const present = summaries.map((s) => s.areas);
  const names = [...new Set(summaries.flatMap((s) => s.bubbles))].sort();
  const top = historyTop(summaries, names);
  const ghostAt = ghostAreas(present, names);
  return {
    present, names, ghostAt,
    rings: ringsAt(top),
    kinds: historyKinds(summaries, names),
    chain: settledRuns(present, names, top, ghostAt),
  };
}

/**
 * The per-run summaries, read one run at a time (so the read can be spread
 * over idle slices), and the history built from them once all are in.
 */
function lazyHistory(areaSetAt, runCount) {
  const summaries = [];
  let history = null;
  const summarizeNext = () => { summaries.push(runSummary(areaSetAt(summaries.length))); };
  const ready = () => {
    while (summaries.length < runCount) summarizeNext();
    if (!history) history = historyOf(summaries);
    return history;
  };
  return { ready, summarizeNext, summarized: () => summaries.length, summaryAt: (k) => summaries[k] };
}

/**
 * The Risk sky of every run (plan Decision 11): every area that is a bubble in
 * some run is on every run's sky, dotted where it has no file; each run
 * settles from the run before it. One scale top over the whole history keeps
 * the targets and the rings still while the runs play. Only per-run area
 * summaries and positions are kept for the whole history; a run's full area
 * set (with its file dots) is rebuilt on demand for the last few runs asked.
 * Nothing is read or laid out up front: the first scene (or `rings()`,
 * `kinds()`, `absenceAt`) reads what is still missing, and `warmStep` does that work
 * ahead of time, one run per call, so a seek finds its run already settled.
 * @param {function(number): {areas: object[], average: number}} areaSetAt run k's area set
 * @param {{day: string}[]} runs the history's runs, oldest first
 * @returns {{rings: function(): {fixFirst: number, watch: number}, kinds: function(): string[],
 *   sceneAt: function(number): {areas: object[], average: number, rings: object, nodes: Map<string, {x: number, y: number, r: number}>},
 *   absenceAt: function(number, string): ({kind: string, day: string}|null),
 *   warmStep: function(): boolean,
 *   progress: function(): {summarized: number, settled: number, total: number}}}
 */
export function createSkyTimeline(areaSetAt, runs) {
  const total = runs.length;
  const lazy = lazyHistory(areaSetAt, total);
  const sceneOf = cachedRuns((k) => {
    const { names, ghostAt, rings, chain } = lazy.ready();
    const full = new Map(areaSetAt(k).areas.map((a) => [a.name, a]));
    const areas = names.map((name) => full.get(name) || ghostAt(name, k));
    return { areas, average: lazy.summaryAt(k).average, rings, nodes: chain.at(k) };
  }, SKY_SCENE_CACHE_SIZE);
  const settled = () => (lazy.summarized() < total ? 0 : lazy.ready().chain.settled());
  let empty = null;
  const emptyScene = () => (empty ||= Object.freeze({ areas: [], average: 0, rings: lazy.ready().rings, nodes: new Map() }));
  return {
    rings: () => lazy.ready().rings,
    kinds: () => lazy.ready().kinds,
    sceneAt: (k) => (k >= 0 && k < total ? sceneOf(k) : emptyScene()),
    absenceAt: (k, name) => absenceIn(runs, k, (j) => Boolean(lazy.ready().present[j]?.has(name))),
    warmStep: () => warmOne(lazy, total, settled()),
    progress: () => ({ summarized: lazy.summarized(), settled: settled(), total }),
  };
}

/** One unit of warm-up: read the next run, or settle the next run once all are read. False when nothing is left. */
function warmOne(lazy, total, settled) {
  if (lazy.summarized() < total) { lazy.summarizeNext(); return true; }
  if (settled >= total) return false;
  lazy.ready().chain.at(settled);
  return true;
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
