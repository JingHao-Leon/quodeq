import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankedAreas } from './rankedAreas.js';

const area = (name, density, lift, kind = 'watch') => ({
  name, kind, density, lift, stats: { files: 4, violations: 6, critical: 1, major: 2 },
});

test('a selection orders by lift, worst first', () => {
  const got = rankedAreas({ areas: [area('a', 0.9, 1.2), area('b', 0.6, 3), area('c', 0.9, 1.2)] });
  assert.deepEqual(got.map((a) => a.name), ['b', 'a', 'c']);
});

test('without a selection density orders', () => {
  assert.deepEqual(rankedAreas({ areas: [area('a', 0.2, null), area('b', 1, null)] }).map((a) => a.name), ['b', 'a']);
});

test('each area carries its zone, files and issues per severity', () => {
  const [row] = rankedAreas({ areas: [area('a', 0.8, 2)] });
  assert.deepEqual(row, {
    name: 'a', kind: 'watch', zone: 'fixFirst', density: 0.8, lift: 2, files: 4,
    severities: { critical: 1, major: 2, minor: 3 },
  });
});

test('an area too small to judge has no zone', () => {
  assert.equal(rankedAreas({ areas: [area('a', 2, 1, 'small')] })[0].zone, null);
});
