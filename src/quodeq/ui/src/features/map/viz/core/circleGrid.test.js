import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forNeighbourPairs } from './circleGrid.js';
import { seededRandom } from './timelapseSynthetic.js';

const COUNT = 400;
const SPREAD = 100;
const SMALL = 3;
const GIANT = 60;

function circles(seed) {
  const rand = seededRandom(seed);
  const out = Array.from({ length: COUNT }, () => ({ x: rand() * SPREAD, y: rand() * SPREAD, r: rand() * SMALL }));
  out.push({ x: SPREAD / 2, y: SPREAD / 2, r: GIANT });
  return out;
}

function overlappingPairs(list, pad) {
  const pairs = new Set();
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < list[i].r + list[j].r + 2 * pad) pairs.add(`${i},${j}`);
  }
  return pairs;
}

test('every overlapping pair is visited, once, even beside a giant circle', () => {
  const list = circles(7);
  const seen = new Map();
  forNeighbourPairs(list, 0, (i, j) => { const key = `${Math.min(i, j)},${Math.max(i, j)}`; seen.set(key, (seen.get(key) || 0) + 1); });
  for (const pair of overlappingPairs(list, 0)) assert.ok(seen.has(pair), pair);
  assert.ok([...seen.values()].every((n) => n === 1));
});

test('the pad widens the reach', () => {
  const list = [{ x: 0, y: 0, r: 1 }, { x: 3, y: 0, r: 1 }];
  const visits = (pad) => { let n = 0; forNeighbourPairs(list, pad, () => { n += 1; }); return n; };
  assert.equal(visits(0), 0);
  assert.equal(visits(1), 1);
});
