import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutSky, needDistance, SKY_RIM, seededAngle } from './skyLayout.js';

const EPS = 1e-6;
const MANY = 300;
const BUDGET_MS = 1500;
const area = (name, needPct, files) => ({ name, needPct, stats: { files } });

function overlaps(nodes) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < nodes[i].r + nodes[j].r - EPS) return true;
  }
  return false;
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
  const t0 = performance.now();
  const nodes = layoutSky(input);
  assert.ok(performance.now() - t0 < BUDGET_MS);
  assert.equal(overlaps(nodes), false);
  assert.ok(nodes.every((n) => Math.hypot(n.x, n.y) + n.r <= SKY_RIM + EPS));
});

test('one giant area still fits', () => {
  const nodes = layoutSky([area('big', 0.9, 4000), area('small', 0.2, 5)]);
  assert.ok(nodes.every((n) => Math.hypot(n.x, n.y) + n.r <= SKY_RIM + EPS));
  assert.equal(overlaps(nodes), false);
});
