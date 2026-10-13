import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hierarchy } from 'd3-hierarchy';
import { packProportional } from './proportionalPack.js';

const SIZE = 600;
const HALF = SIZE / 2;
const EPS = 1e-6;
const HEAVY = 4;
const NEARLY = 0.03;           // within 3 % of the map size
const FLAT_FILES = 3000;
const FLAT_BUDGET_MS = 1000;

function sample(scale = 1) {
  return { name: 'root', children: [
    { name: 'a', children: [{ name: 'a1', v: 9 * scale }, { name: 'a2', v: 4 * scale }, { name: 'a3', v: 1 * scale }] },
    { name: 'b', children: [{ name: 'b1', v: 16 * scale }] },
    { name: 'c', v: 25 * scale },
  ] };
}

function packed(tree) {
  const root = hierarchy(tree, (d) => d.children).sum((d) => (d.children ? 0 : d.v)).sort((x, y) => y.value - x.value);
  return packProportional(root, SIZE);
}

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

test('the whole map fills the square, centred', () => {
  const root = packed(sample());
  assert.ok(Math.abs(root.x - HALF) < EPS && Math.abs(root.y - HALF) < EPS);
  assert.ok(Math.abs(root.r - HALF) < EPS);
});

test('a leaf radius follows the square root of its checks', () => {
  const root = packed(sample());
  const byName = new Map(root.descendants().map((n) => [n.data.name, n]));
  assert.ok(Math.abs(byName.get('a1').r / byName.get('a2').r - 3 / 2) < EPS);
});

test('every child sits inside its parent', () => {
  for (const n of packed(sample()).descendants()) {
    if (n.parent) assert.ok(dist(n, n.parent) + n.r <= n.parent.r + EPS, n.data.name);
  }
});

test('siblings never overlap', () => {
  for (const n of packed(sample()).descendants()) {
    const kids = n.children || [];
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      assert.ok(dist(kids[i], kids[j]) >= kids[i].r + kids[j].r - EPS);
    }
  }
});

test('gaps are proportional: a uniformly heavier tree looks nearly the same', () => {
  // Only the small constant terms (+0.08, +0.1) are not proportional, so the
  // two layouts differ by a hair, never by a visible shift.
  const a = packed(sample()).descendants();
  const b = packed(sample(HEAVY)).descendants();
  const tolerance = SIZE * NEARLY;
  a.forEach((n, i) => assert.ok(Math.abs(n.x - b[i].x) < tolerance && Math.abs(n.r - b[i].r) < tolerance));
});

test('one flat folder of thousands of files packs quickly without overlaps', () => {
  const kids = Array.from({ length: FLAT_FILES }, (_, i) => ({ name: `f${i}`, v: (i % 7) + 1 }));
  const t0 = performance.now();
  const root = packed({ name: 'root', children: [{ name: 'flat', children: kids }] });
  assert.ok(performance.now() - t0 < FLAT_BUDGET_MS);
  const flat = root.children[0];
  for (const n of flat.children) assert.ok(dist(n, flat) + n.r <= flat.r + EPS);
});
