import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSkyTimeline, lerpSkyNodes } from './skyTimeline.js';
import { densityTop, ringsAt, SKY_MIN_FILES } from './skyLayout.js';
import { ABSENCE } from './timelapseScene.js';

const SMALL_DRIFT = 0.02;
const HALF = 0.5;
const stats = (files) => ({ violations: files, compliance: files, weight: files, files, critical: 0, major: 0 });
const area = (name, files, density = HALF) => ({ name, kind: 'watch', density, layers: [], dots: [], stats: stats(files) });
const SETS = [
  { areas: [area('alpha', 8), area('beta', 6, 0.8)], average: 1 },
  { areas: [area('alpha', 9), area('beta', 6, 0.8)], average: 1 },
  { areas: [area('alpha', 9), area('gamma', 7, 2.4)], average: 1 },
];
const RUNS = [{ day: '2026-09-01' }, { day: '2026-09-08' }, { day: '2026-09-15' }];
const timeline = () => createSkyTimeline((k) => SETS[k], RUNS);

test('every area that is ever a bubble is on every run, dotted where it has no file', () => {
  const zero = timeline().sceneAt(0);
  assert.deepEqual(zero.areas.map((a) => a.name), ['alpha', 'beta', 'gamma']);
  assert.equal(zero.areas[2].ghost, true);
  assert.equal(zero.areas[0].ghost, undefined);
});

test('a dotted area keeps the density of the nearest run that has it', () => {
  const tl = timeline();
  assert.equal(tl.sceneAt(0).areas[2].density, 2.4);
  assert.equal(tl.sceneAt(2).areas[1].density, 0.8);
  assert.equal(tl.sceneAt(0).areas[2].stats.files, 0);
});

test('one scale for the whole history: the rings never move between runs', () => {
  const tl = timeline();
  const top = densityTop(SETS.flatMap((s) => s.areas));
  assert.deepEqual(tl.rings, ringsAt(top));
  assert.deepEqual(tl.sceneAt(0).rings, tl.rings);
  assert.deepEqual(tl.sceneAt(2).rings, tl.rings);
});

test('a run settles from the run before: little drift when little changes', () => {
  const tl = timeline();
  const a = tl.sceneAt(0).nodes.get('alpha');
  const b = tl.sceneAt(1).nodes.get('alpha');
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= SMALL_DRIFT, `${Math.hypot(a.x - b.x, a.y - b.y)}`);
});

test('a dotted area says since when it is gone or when it first appears', () => {
  const tl = timeline();
  assert.deepEqual(tl.absenceAt(2, 'beta'), { kind: ABSENCE.GONE_SINCE, day: '2026-09-15' });
  assert.deepEqual(tl.absenceAt(0, 'gamma'), { kind: ABSENCE.FIRST_APPEARS, day: '2026-09-15' });
  assert.equal(tl.absenceAt(0, 'alpha'), null);
});

test('the run averages come from each run', () => {
  const sets = [{ ...SETS[0], average: 2 }, SETS[1]];
  const tl = createSkyTimeline((k) => sets[k], RUNS.slice(0, 2));
  assert.equal(tl.sceneAt(1).average, 1);
  assert.equal(tl.sceneAt(0).average, 2);
});

test('bubbles tween by name', () => {
  const tl = timeline();
  const { areas, nodes } = tl.sceneAt(1);
  const mid = lerpSkyNodes(areas, tl.sceneAt(0).nodes, nodes, 1);
  assert.deepEqual(mid, areas.map((a) => nodes.get(a.name)));
});

test('halfway between two runs is halfway in position and radius', () => {
  const from = new Map([['a', { x: 0, y: 0, r: 0.1 }]]);
  const to = new Map([['a', { x: 0.4, y: -0.2, r: 0.3 }]]);
  const [mid] = lerpSkyNodes([{ name: 'a' }], from, to, HALF);
  assert.ok(Math.abs(mid.x - 0.2) < 1e-9 && Math.abs(mid.y + 0.1) < 1e-9 && Math.abs(mid.r - 0.2) < 1e-9);
});

test('an area under the bubble size in one run is still a real bubble there, not a dotted one', () => {
  const sets = [{ areas: [area('alpha', SKY_MIN_FILES)], average: 1 }, { areas: [area('alpha', SKY_MIN_FILES - 1)], average: 1 }];
  const tl = createSkyTimeline((k) => sets[k], RUNS.slice(0, 2));
  const [small] = tl.sceneAt(1).areas;
  assert.equal(small.ghost, undefined);
  assert.equal(small.stats.files, SKY_MIN_FILES - 1);
  assert.equal(tl.absenceAt(1, 'alpha'), null);
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
  assert.equal(tl.absenceAt(0, 'alpha'), null);
});

test('the kinds of the whole history, so a legend keeps its rows from run to run', () => {
  const sets = SETS.map((set, k) => ({ ...set, areas: set.areas.map((a) => (a.name === 'beta' && k === 0 ? { ...a, kind: 'hotspot' } : a)) }));
  const kinds = createSkyTimeline((k) => sets[k], RUNS).kinds;
  assert.deepEqual([...kinds].sort(), ['hotspot', 'watch']);
  assert.deepEqual(createSkyTimeline(() => SETS[0], []).kinds, []);
});
