import { layoutSky, layoutSkyFrom, skyAreas } from './skyLayout.js';
import { skyRings } from './skyScale.js';
import { cachedRuns } from './timelapseScene.js';

const NO_STATS = Object.freeze({ violations: 0, compliance: 0, weight: 0, files: 0, critical: 0, major: 0 });
/** Full area sets kept at once: the two runs of a move plus a little slack for scrubbing. */
export const SKY_SCENE_CACHE_SIZE = 4;
/** Where an area a run does not have sits: nowhere, at radius 0 (it grows in or shrinks out where it is drawn). */
const NO_BUBBLE = Object.freeze({ x: 0, y: 0, r: 0 });

/** An area that is not a bubble in a run: drawn at radius 0, never hovered, labelled or listed. */
function absentArea(name) {
  return { name, absent: true, kind: null, density: 0, touchedShare: 0, layers: [], dots: [], stats: NO_STATS };
}

/**
 * What the layout needs of a run, without its files: each area's density and
 * file count by name, the names that are bubbles, and the run's average.
 */
function runSummary(set) {
  const areas = new Map(set.areas.map((a) => [a.name, { name: a.name, kind: a.kind, density: a.density, stats: { files: a.stats.files } }]));
  return { areas, bubbles: skyAreas(set).map((a) => a.name), average: set.average };
}

/** Every kind an area on the sky has in some run (a legend that holds still while the runs play). */
function historyKinds(summaries) {
  const kinds = summaries.flatMap(({ areas, bubbles }) => bubbles.map((n) => areas.get(n).kind));
  return [...new Set(kinds.filter(Boolean))];
}

/**
 * Each run's own sky, as today's sky is drawn: only the run's bubbles, under
 * the run's own scale and rings. The base is today's sky (the latest
 * run, laid out as the Risk tab lays it out); every other run starts from it
 * and settles toward its own targets, so runs never depend on each other and
 * the latest run is today's sky. Computed in order up to the run asked for
 * and kept (a few dozen positions per run).
 * @returns {{at: function(number): {nodes: Map<string, {x: number, y: number, r: number}>, rings: object}, settled: function(): number}}
 */
function daySkies(summaries, names) {
  const last = summaries.length - 1;
  const bubblesOf = (k) => summaries[k].bubbles.map((name) => summaries[k].areas.get(name));
  let base = null;
  const baseOf = () => {
    if (!base) {
      const areas = bubblesOf(last);
      const laid = layoutSky(areas);
      base = new Map(areas.map((a, i) => [a.name, laid[i]]));
    }
    return base;
  };
  const skyOf = (k) => {
    const areas = bubblesOf(k);
    const laid = k === last ? areas.map((a) => baseOf().get(a.name)) : layoutSkyFrom(areas, baseOf());
    const own = new Map(areas.map((a, i) => [a.name, laid[i]]));
    return { nodes: new Map(names.map((name) => [name, own.get(name) || NO_BUBBLE])), rings: skyRings(areas) };
  };
  const skies = [];
  const at = (k) => {
    for (let j = skies.length; j <= k; j++) skies.push(skyOf(j));
    return skies[k];
  };
  return { at, settled: () => skies.length };
}

/**
 * What the whole history decides once every run is summarised: the names on
 * the sky (every area that is a bubble in some run), the legend's kinds, and
 * each run's sky.
 */
function historyOf(summaries) {
  const names = [...new Set(summaries.flatMap((s) => s.bubbles))].sort();
  return {
    bubbles: summaries.map((s) => new Set(s.bubbles)),
    names,
    kinds: historyKinds(summaries),
    chain: daySkies(summaries, names),
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
 * The Risk sky of every run (spec 2.5): each run shows only its own bubbles,
 * under its own scale and rings, laid out from today's sky; an area a run
 * does not have is in the scene at radius 0, so between runs it grows in or
 * shrinks out. Only per-run area summaries and positions are kept for the
 * whole history; a run's full area set (with its file dots) is rebuilt on
 * demand for the last few runs asked. Nothing is read or laid out up front:
 * the first scene (or `kinds()`) reads what is still missing, and `warmStep`
 * does that work ahead of time, one run per call, so a seek finds its run ready.
 * @param {function(number): {areas: object[], average: number}} areaSetAt run k's area set
 * @param {{day: string}[]} runs the history's runs, oldest first
 * @returns {{kinds: function(): string[],
 *   sceneAt: function(number): {areas: object[], average: number, rings: object, nodes: Map<string, {x: number, y: number, r: number}>},
 *   warmStep: function(): boolean,
 *   progress: function(): {summarized: number, settled: number, total: number}}}
 */
export function createSkyTimeline(areaSetAt, runs) {
  const total = runs.length;
  const lazy = lazyHistory(areaSetAt, total);
  const sceneOf = cachedRuns((k) => {
    const { names, bubbles, chain } = lazy.ready();
    const full = new Map(areaSetAt(k).areas.map((a) => [a.name, a]));
    const areas = names.map((name) => (bubbles[k].has(name) ? full.get(name) : absentArea(name)));
    const { nodes, rings } = chain.at(k);
    return { areas, average: lazy.summaryAt(k).average, rings, nodes };
  }, SKY_SCENE_CACHE_SIZE);
  const settled = () => (lazy.summarized() < total ? 0 : lazy.ready().chain.settled());
  let empty = null;
  const emptyScene = () => (empty ||= Object.freeze({ areas: [], average: 0, rings: skyRings([]), nodes: new Map() }));
  return {
    kinds: () => lazy.ready().kinds,
    sceneAt: (k) => (k >= 0 && k < total ? sceneOf(k) : emptyScene()),
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
 * (every name is in both). A bubble that appears grows where it lands and one
 * that goes shrinks where it was. At `t >= 1` it is exactly the target, so
 * the end of a move never pops.
 * @param {{name: string}[]} areas the target run's areas
 * @param {Map<string, {x: number, y: number, r: number}>} fromNodes
 * @param {Map<string, {x: number, y: number, r: number}>} toNodes
 * @param {number} t progress, 0..1
 * @returns {{x: number, y: number, r: number}[]}
 */
export function lerpSkyNodes(areas, fromNodes, toNodes, t) {
  return areas.map(({ name }) => {
    const b = toNodes.get(name);
    if (t >= 1) return { x: b.x, y: b.y, r: b.r };
    const a = fromNodes.get(name);
    const at = a.r > 0 && b.r > 0 ? t : Number(a.r === 0);
    return { x: a.x + (b.x - a.x) * at, y: a.y + (b.y - a.y) * at, r: a.r + (b.r - a.r) * t };
  });
}

/** The rings between two runs' skies: each line slides from one run's place to the other's. */
export function lerpRings(from, to, t) {
  if (t >= 1) return to;
  return { fixFirst: from.fixFirst + (to.fixFirst - from.fixFirst) * t, watch: from.watch + (to.watch - from.watch) * t, counts: to.counts };
}
