import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSkyTimeline, lerpSkyNodes, lerpRings } from './skyTimeline.js';
import { layoutSky, skyAreas, SKY_MIN_FILES } from './skyLayout.js';
import { skyRings } from './skyScale.js';

const SMALL_DRIFT = 0.02;
const HALF = 0.5;
const TINY = 1e-9;
const stats = (files) => ({ violations: files, compliance: files, weight: files, files, critical: 0, major: 0 });
const area = (name, files, density = HALF) => ({ name, kind: 'watch', density, layers: [], dots: [], stats: stats(files) });
const SETS = [
  { areas: [area('alpha', 8), area('beta', 6, 0.8)], average: 1 },
  { areas: [area('alpha', 9), area('beta', 6, 0.8)], average: 1 },
  { areas: [area('alpha', 9), area('gamma', 7, 2.4)], average: 1 },
];
const RUNS = [{ day: '2026-09-01' }, { day: '2026-09-08' }, { day: '2026-09-15' }];
const timeline = (sets = SETS) => createSkyTimeline((k) => sets[k], RUNS.slice(0, sets.length));
const near = (a, b) => Math.abs(a - b) < TINY;

test('every area that is ever a bubble is in every run\'s scene, as an absent area where the run lacks it', () => {
  const zero = timeline().sceneAt(0);
  assert.deepEqual(zero.areas.map((a) => a.name), ['alpha', 'beta', 'gamma']);
  assert.equal(zero.areas[2].absent, true);
  assert.equal(zero.areas[2].stats.files, 0);
  assert.equal(zero.areas[0].absent, undefined);
});

test('a run shows only its own bubbles: the absent ones sit at radius 0', () => {
  const tl = timeline();
  const radius = (k, name) => tl.sceneAt(k).nodes.get(name).r;
  assert.ok(radius(0, 'alpha') > 0 && radius(0, 'beta') > 0);
  assert.equal(radius(0, 'gamma'), 0);
  assert.equal(radius(2, 'beta'), 0);
  assert.ok(radius(2, 'gamma') > 0);
});

test('an area under the bubble size in one run is absent there', () => {
  const sets = [{ areas: [area('alpha', SKY_MIN_FILES)], average: 1 }, { areas: [area('alpha', SKY_MIN_FILES - 1)], average: 1 }];
  const tl = timeline(sets);
  assert.equal(tl.sceneAt(1).areas[0].absent, true);
  assert.equal(tl.sceneAt(1).nodes.get('alpha').r, 0);
  assert.ok(tl.sceneAt(0).nodes.get('alpha').r > 0);
});

test('the latest run is today\'s sky: the Risk tab\'s layout of its bubbles, under its rings', () => {
  const last = SETS.length - 1;
  const scene = timeline().sceneAt(last);
  const bubbles = skyAreas(SETS[last]);
  assert.deepEqual(bubbles.map((a) => scene.nodes.get(a.name)), layoutSky(bubbles));
  assert.deepEqual(scene.rings, skyRings(bubbles));
});

test('each run has its own rings, from its own bubbles', () => {
  const tl = timeline();
  SETS.forEach((set, k) => assert.deepEqual(tl.sceneAt(k).rings, skyRings(skyAreas(set))));
  assert.notDeepEqual(tl.sceneAt(0).rings, tl.sceneAt(2).rings);
});

test('a run does not depend on the runs before it, only on itself and today', () => {
  const other = [{ areas: [area('alpha', 30, 2), area('delta', 12, 0.1)], average: 1 }, SETS[1], SETS[2]];
  const bubblesAt = (tl) => [...tl.sceneAt(1).nodes].filter(([, n]) => n.r > 0);
  assert.deepEqual(bubblesAt(timeline(other)), bubblesAt(timeline()));
});

test('a run settles from today\'s sky: little drift when little changes', () => {
  const tl = timeline();
  const a = tl.sceneAt(0).nodes.get('alpha');
  const b = tl.sceneAt(1).nodes.get('alpha');
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= SMALL_DRIFT, `${Math.hypot(a.x - b.x, a.y - b.y)}`);
});

test('the run averages come from each run', () => {
  const sets = [{ ...SETS[0], average: 2 }, SETS[1]];
  const tl = timeline(sets);
  assert.equal(tl.sceneAt(1).average, 1);
  assert.equal(tl.sceneAt(0).average, 2);
});

test('a scene hands back the run\'s own areas, file dots included', () => {
  const tl = timeline();
  assert.equal(tl.sceneAt(1).areas[0], SETS[1].areas[0]);
  assert.equal(tl.sceneAt(2).areas[2], SETS[2].areas[1]);
});

test('an empty history has an empty sky and never throws', () => {
  const tl = createSkyTimeline(() => { throw new Error('no runs to read'); }, []);
  const scene = tl.sceneAt(0);
  assert.deepEqual(scene.areas, []);
  assert.equal(scene.nodes.size, 0);
  assert.equal(scene.average, 0);
  assert.deepEqual(scene.rings, skyRings([]));
});

test('the kinds of the whole history, so a legend keeps its rows from run to run', () => {
  const sets = SETS.map((set, k) => ({ ...set, areas: set.areas.map((a) => (a.name === 'beta' && k === 0 ? { ...a, kind: 'hotspot' } : a)) }));
  const kinds = createSkyTimeline((k) => sets[k], RUNS).kinds();
  assert.deepEqual([...kinds].sort(), ['hotspot', 'watch']);
  assert.deepEqual(createSkyTimeline(() => SETS[0], []).kinds(), []);
});

test('bubbles tween by name, and the end of a move is exactly the target', () => {
  const tl = timeline();
  const { areas, nodes } = tl.sceneAt(1);
  const end = lerpSkyNodes(areas, tl.sceneAt(0).nodes, nodes, 1);
  assert.deepEqual(end, areas.map((a) => nodes.get(a.name)));
});

test('halfway between two runs is halfway in position and radius', () => {
  const from = new Map([['a', { x: 0, y: 0, r: 0.1 }]]);
  const to = new Map([['a', { x: 0.4, y: -0.2, r: 0.3 }]]);
  const [mid] = lerpSkyNodes([{ name: 'a' }], from, to, HALF);
  assert.ok(near(mid.x, 0.2) && near(mid.y, -0.1) && near(mid.r, 0.2), JSON.stringify(mid));
});

test('a bubble that appears grows where it lands; one that goes shrinks where it was', () => {
  const at = { x: 0.4, y: -0.2, r: 0.3 };
  const none = { x: 0, y: 0, r: 0 };
  const [grows] = lerpSkyNodes([{ name: 'a' }], new Map([['a', none]]), new Map([['a', at]]), HALF);
  const [shrinks] = lerpSkyNodes([{ name: 'a' }], new Map([['a', at]]), new Map([['a', none]]), HALF);
  assert.deepEqual({ x: grows.x, y: grows.y }, { x: at.x, y: at.y });
  assert.deepEqual({ x: shrinks.x, y: shrinks.y }, { x: at.x, y: at.y });
  assert.ok(near(grows.r, at.r * HALF) && near(shrinks.r, at.r * HALF), `${grows.r} ${shrinks.r}`);
});

test('the rings slide from one run\'s place to the other\'s, counted as the target run', () => {
  const from = { fixFirst: 0.1, watch: 0.3, counts: { fixFirst: 0, watch: 2 } };
  const to = { fixFirst: 0.3, watch: 0.5, counts: { fixFirst: 4, watch: 1 } };
  const mid = lerpRings(from, to, HALF);
  assert.ok(near(mid.fixFirst, 0.2) && near(mid.watch, 0.4), JSON.stringify(mid));
  assert.equal(mid.counts, to.counts);
  assert.equal(lerpRings(from, to, 1), to);
});

const LONG_HISTORY = 12;

function longTimeline() {
  const sets = Array.from({ length: LONG_HISTORY }, (_, k) => ({
    areas: [area('alpha', 8 + k), area('beta', 6, 0.8), ...(k % 3 ? [area('gamma', 7, 2.4)] : [])], average: 1,
  }));
  const runs = sets.map((_, k) => ({ day: `2026-09-${String(k + 1).padStart(2, '0')}` }));
  let reads = 0;
  const tl = createSkyTimeline((k) => { reads += 1; return sets[k]; }, runs);
  return { tl, reads: () => reads };
}

test('nothing is read or laid out until a run is asked for or warmed', () => {
  const { tl, reads } = longTimeline();
  assert.equal(reads(), 0);
  assert.deepEqual(tl.progress(), { summarized: 0, settled: 0, total: LONG_HISTORY });
});

test('each warm step does one run of work: every run read, then every run settled, then nothing left', () => {
  const { tl } = longTimeline();
  let steps = 0;
  while (tl.warmStep()) steps += 1;
  assert.equal(steps, LONG_HISTORY * 2);
  assert.deepEqual(tl.progress(), { summarized: LONG_HISTORY, settled: LONG_HISTORY, total: LONG_HISTORY });
  assert.equal(tl.warmStep(), false);
});

test('a warmed run is handed back without any layout work', () => {
  const { tl } = longTimeline();
  while (tl.warmStep());
  const before = tl.progress();
  const scene = tl.sceneAt(LONG_HISTORY - 1);
  assert.deepEqual(tl.progress(), before);
  assert.equal(scene.nodes.size, 3);
});

test('a warmed sky is the sky a cold seek computes', () => {
  const warm = longTimeline().tl;
  while (warm.warmStep());
  const cold = longTimeline().tl;
  const k = LONG_HISTORY - 1;
  assert.deepEqual([...warm.sceneAt(k).nodes], [...cold.sceneAt(k).nodes]);
  assert.deepEqual(warm.sceneAt(k).rings, cold.sceneAt(k).rings);
});

test('a seek beyond what is warmed settles the rest, and warming carries on from there', () => {
  const { tl } = longTimeline();
  tl.warmStep();
  tl.sceneAt(LONG_HISTORY / 2);
  assert.deepEqual(tl.progress(), { summarized: LONG_HISTORY, settled: LONG_HISTORY / 2 + 1, total: LONG_HISTORY });
  let steps = 0;
  while (tl.warmStep()) steps += 1;
  assert.equal(steps, LONG_HISTORY / 2 - 1);
});
