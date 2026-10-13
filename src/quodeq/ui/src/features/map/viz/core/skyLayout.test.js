import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutSky, needDistance, SKY_RIM, seededAngle } from './skyLayout.js';

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
const HALF_NEED = 0.5;
const area = (name, needPct, files) => ({ name, needPct, stats: { files } });

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

test('more need sits closer to the centre', () => {
  assert.ok(needDistance(0.9) < needDistance(0.1));
  const [hot, calm] = layoutSky([area('hot', 0.95, 10), area('calm', 0.05, 10)]);
  assert.ok(Math.hypot(hot.x, hot.y) < Math.hypot(calm.x, calm.y));
});

test('the same areas always land in the same place', () => {
  const input = [area('a', 0.3, 12), area('b', 0.7, 40), area('c', 0.5, 6)];
  assert.deepEqual(layoutSky(input), layoutSky(input));
  assert.equal(seededAngle('article'), seededAngle('article'));
});

test('hundreds of areas: fast, no overlaps, inside the rim', () => {
  const input = Array.from({ length: MANY }, (_, i) => area(`a${i}`, (i % 97) / 96, 5 + (i % 40)));
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

test('hundreds of areas at the same need still separate', () => {
  const input = Array.from({ length: MANY }, (_, i) => area(`s${i}`, HALF_NEED, SMALL_MIN + (i % SMALL_SPREAD)));
  assert.equal(overlaps(layoutSky(input)), false);
});

test('one giant area still fits', () => {
  const nodes = layoutSky([area('big', 0.9, 4000), area('small', 0.2, 5)]);
  assert.ok(nodes.every((n) => Math.hypot(n.x, n.y) + n.r <= SKY_RIM + EPS));
  assert.equal(overlaps(nodes), false);
});
