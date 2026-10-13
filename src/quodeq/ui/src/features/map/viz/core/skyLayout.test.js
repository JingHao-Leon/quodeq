import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutSky, layoutSkyFrom, skyAreas, densityDistance, densityTop, skyRings, ringsAt, SKY_RIM, seededAngle,
  FIX_FIRST_DENSITY, WATCH_DENSITY,
} from './skyLayout.js';

const EPS = 1e-6;
const MANY = 300;
const CROWD = 600;
const BUDGET_MS = 1500;
const GIANTS = [1200, 2500, 4000, 6000];
const SMALL_MIN = 5;
const SMALL_SPREAD = 6;
const TAIL_FILES = 400;
const TAIL_POWER = 3;
const SEED_STEP = 0.618034;
const HALF_DENSITY = 0.5;
const MESSY_TOP = 6;
const CLEAN = [0, 0.08, 0.15, 0.46];
const ANCHORED_AREAS = 40;
const ANCHORED_DRIFT = 0.05;
const area = (name, density, files) => ({ name, density, stats: { files } });

function overlaps(nodes) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < nodes[i].r + nodes[j].r - EPS) return true;
  }
  return false;
}

const inside = (nodes) => nodes.every((n) => Math.hypot(n.x, n.y) + n.r <= SKY_RIM + EPS);
const fraction = (i) => (i * SEED_STEP) % 1;

function timed(input) {
  const t0 = performance.now();
  const nodes = layoutSky(input);
  return { nodes, ms: performance.now() - t0 };
}

test('denser areas sit closer to the centre, a clean area at the outer edge', () => {
  assert.ok(densityDistance(2, MESSY_TOP) < densityDistance(HALF_DENSITY, MESSY_TOP));
  assert.ok(densityDistance(0, MESSY_TOP) > densityDistance(HALF_DENSITY, MESSY_TOP));
  assert.equal(densityDistance(MESSY_TOP * 2, MESSY_TOP), densityDistance(MESSY_TOP, MESSY_TOP));
  const [hot, calm] = layoutSky([area('hot', 3, 10), area('calm', 0.05, 10)]);
  assert.ok(Math.hypot(hot.x, hot.y) < Math.hypot(calm.x, calm.y));
});

test('the scale tops out at the densest area, never below the fix-first floor', () => {
  assert.equal(densityTop(CLEAN.map((d, i) => area(`c${i}`, d, 5))), FIX_FIRST_DENSITY);
  assert.equal(densityTop([area('a', 0.2, 5), area('b', MESSY_TOP, 5)]), MESSY_TOP);
  assert.equal(densityTop([]), FIX_FIRST_DENSITY);
});

test('a clean project: the rings shrink toward the centre and every area sits outside them', () => {
  const areas = CLEAN.map((d, i) => area(`c${i}`, d, 5));
  const rings = skyRings(areas);
  const top = densityTop(areas);
  assert.ok(areas.every((a) => densityDistance(a.density, top) > rings.watch));
  assert.ok(rings.fixFirst < rings.watch);
});

test('a messy project: the rings widen, fix first still inside watch', () => {
  const clean = skyRings([area('c', 0.2, 5)]);
  const messy = skyRings([area('m', MESSY_TOP, 5), area('n', 1, 5)]);
  assert.ok(messy.fixFirst > clean.fixFirst);
  assert.ok(messy.watch > clean.watch);
  assert.ok(messy.fixFirst < messy.watch);
  assert.ok(WATCH_DENSITY < FIX_FIRST_DENSITY);
});

test('the same areas always land in the same place', () => {
  const input = [area('a', 0.3, 12), area('b', 0.7, 40), area('c', 0.5, 6)];
  assert.deepEqual(layoutSky(input), layoutSky(input));
  assert.equal(seededAngle('article'), seededAngle('article'));
});

test('hundreds of areas: fast, no overlaps, inside the rim', () => {
  const input = Array.from({ length: MANY }, (_, i) => area(`a${i}`, (i % 97) / 24, 5 + (i % 40)));
  const { nodes, ms } = timed(input);
  assert.ok(ms < BUDGET_MS);
  assert.equal(overlaps(nodes), false);
  assert.ok(inside(nodes));
});

test('lopsided sizes: a few giants among hundreds of small areas, no overlaps', () => {
  const input = Array.from({ length: MANY }, (_, i) => area(`l${i}`, fraction(i), GIANTS[i] ?? SMALL_MIN + (i % SMALL_SPREAD)));
  const { nodes, ms } = timed(input);
  assert.ok(ms < BUDGET_MS);
  assert.equal(overlaps(nodes), false);
  assert.ok(inside(nodes));
});

test('six hundred heavy-tailed areas: fast, no overlaps, inside the rim', () => {
  const input = Array.from({ length: CROWD }, (_, i) => area(`h${i}`, fraction(i + 1), SMALL_MIN + Math.round(TAIL_FILES * fraction(i * 7 + 3) ** TAIL_POWER)));
  const { nodes, ms } = timed(input);
  assert.ok(ms < BUDGET_MS);
  assert.equal(overlaps(nodes), false);
  assert.ok(inside(nodes));
});

test('hundreds of areas at the same density still separate', () => {
  const input = Array.from({ length: MANY }, (_, i) => area(`s${i}`, HALF_DENSITY, SMALL_MIN + (i % SMALL_SPREAD)));
  assert.equal(overlaps(layoutSky(input)), false);
});

test('one giant area still fits', () => {
  const nodes = layoutSky([area('big', 0.9, 4000), area('small', 0.2, 5)]);
  assert.ok(nodes.every((n) => Math.hypot(n.x, n.y) + n.r <= SKY_RIM + EPS));
  assert.equal(overlaps(nodes), false);
});

test('an anchored sky starts from the previous positions and stays clean', () => {
  const areas = Array.from({ length: ANCHORED_AREAS }, (_, i) => area(`a${i}`, fraction(i), SMALL_MIN + i));
  const before = layoutSky(areas);
  const previous = new Map(areas.map((a, i) => [a.name, before[i]]));
  const after = layoutSkyFrom(areas, previous);
  const drift = Math.max(...after.map((n, i) => Math.hypot(n.x - before[i].x, n.y - before[i].y)));
  assert.ok(drift < ANCHORED_DRIFT, `${drift}`);
  assert.equal(overlaps(after), false);
  assert.ok(inside(after));
});

test('a given scale top places areas against it, not against their own densest', () => {
  const areas = [area('hot', 1, 10), area('calm', HALF_DENSITY, 10)];
  const [own] = layoutSky(areas);
  const [wide] = layoutSky(areas, MESSY_TOP);
  assert.ok(Math.hypot(wide.x, wide.y) > Math.hypot(own.x, own.y));
  assert.deepEqual(ringsAt(densityTop(areas)), skyRings(areas));
});

test('only areas with enough files are bubbles', () => {
  const set = { areas: [area('a', HALF_DENSITY, SMALL_MIN - 1), area('b', HALF_DENSITY, SMALL_MIN)] };
  assert.deepEqual(skyAreas(set).map((a) => a.name), ['b']);
});
