import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutSky, layoutSkyFrom, skyAreas, SKY_RIM, seededAngle } from './skyLayout.js';
import { densityDistance, skyScale, zoneOf } from './skyScale.js';
import { SKY_ZONE } from '../../mapVocab.js';

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
const OUTLIER = 9;
const SPREAD_AREAS = 20;
const SPREAD_MAX = 2;
const DISTANCE_TOLERANCE = 0.03;
const area = (name, density, files) => ({ name, density, stats: { files } });
const fromCentre = (n) => Math.hypot(n.x, n.y);
// Twenty areas spread evenly up to SPREAD_MAX: a project with a heavy but ordinary tail.
const spread = () => Array.from({ length: SPREAD_AREAS }, (_, i) => area(`s${i}`, ((i + 1) / SPREAD_AREAS) * SPREAD_MAX, SMALL_MIN));

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
  const [hot, calm] = layoutSky([area('hot', MESSY_TOP, 10), area('calm', 0.05, 10)]);
  assert.ok(fromCentre(hot) < fromCentre(calm));
});

/** The distances from the centre each area's zone spans under the areas' own scale. */
function bandsOf(areas) {
  const { fixFirst, watch } = skyScale(areas);
  const band = { [SKY_ZONE.FIX_FIRST]: [0, fixFirst], [SKY_ZONE.WATCH]: [fixFirst, watch], [SKY_ZONE.HEALTHY]: [watch, SKY_RIM] };
  return areas.map((a) => band[zoneOf(a.density)]);
}

test('every bubble\'s centre stays inside its own zone', () => {
  const input = Array.from({ length: MANY }, (_, i) => area(`z${i}`, (i % 97) / 24, SMALL_MIN + (i % 40)));
  const bands = bandsOf(input);
  const outside = layoutSky(input).filter((n, i) => fromCentre(n) < bands[i][0] - EPS || fromCentre(n) > bands[i][1] + EPS);
  assert.deepEqual(outside, []);
});

test('a clean project: every area sits outside the watch ring', () => {
  const areas = CLEAN.map((d, i) => area(`c${i}`, d, SMALL_MIN));
  const { watch } = skyScale(areas);
  assert.ok(layoutSky(areas).every((n) => fromCentre(n) > watch), `${watch}`);
});

test('an area denser than the scale top sits at the innermost distance, not beyond it', () => {
  const areas = [...spread(), area('outlier', OUTLIER, SMALL_MIN)];
  const scale = skyScale(areas);
  assert.ok(scale.top < OUTLIER);
  assert.equal(densityDistance(OUTLIER, scale), densityDistance(scale.top, scale));
  assert.ok(Math.abs(fromCentre(layoutSky(areas).at(-1)) - densityDistance(scale.top, scale)) < DISTANCE_TOLERANCE);
});

test('one extreme area no longer pushes every other area outward', () => {
  const others = spread();
  const withOutlier = [...others, area('outlier', OUTLIER, SMALL_MIN)];
  const alone = layoutSky(others);
  const together = layoutSky(withOutlier);
  // On average: a neighbour of the outlier near the centre may still be nudged aside by its bubble.
  const drift = others.reduce((sum, _, i) => sum + Math.abs(fromCentre(together[i]) - fromCentre(alone[i])), 0) / others.length;
  assert.ok(drift < DISTANCE_TOLERANCE, `${drift}`);
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

test('only areas with enough files are bubbles', () => {
  const set = { areas: [area('a', HALF_DENSITY, SMALL_MIN - 1), area('b', HALF_DENSITY, SMALL_MIN)] };
  assert.deepEqual(skyAreas(set).map((a) => a.name), ['b']);
});
