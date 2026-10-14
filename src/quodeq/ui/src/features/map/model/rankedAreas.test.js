import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankedAreas, reworkSummary } from './rankedAreas.js';

const area = (name, density, lift, { kind = 'watch', files = 8 } = {}) => ({
  name, kind, density, lift, stats: { files, violations: 6, critical: 1, major: 2 },
});
const names = (rows) => rows.map((a) => a.name);

test('zones lead on the absolute lines: fix first, then watch, then healthy, whatever the lift', () => {
  const got = rankedAreas({ areas: [area('calm', 0.2, 9), area('watch', 0.6, 0.5), area('hot', 0.9, 0.4)] });
  assert.deepEqual(names(got), ['hot', 'watch', 'calm']);
});

test('within a zone a selection orders by lift, then density, then name', () => {
  const got = rankedAreas({ areas: [area('a', 0.9, 1.2), area('b', 0.8, 3), area('c', 0.9, 1.2), area('d', 1.4, 1.2)] });
  assert.deepEqual(names(got), ['b', 'd', 'a', 'c']);
});

test('without a selection density orders within a zone', () => {
  assert.deepEqual(names(rankedAreas({ areas: [area('a', 0.8, null), area('b', 1, null)] })), ['b', 'a']);
});

test('an area too small to judge has no zone and comes last; one the sky does not draw is left out', () => {
  const got = rankedAreas({ areas: [area('tiny', 3, 5, { kind: 'small' }), area('calm', 0.1, 0.1), area('few', 2, 2, { files: 4 })] });
  assert.deepEqual(names(got), ['calm', 'tiny']);
  assert.equal(got[1].zone, null);
});

test('each area carries its zone, files and issues per severity', () => {
  const [row] = rankedAreas({ areas: [area('a', 0.8, 2)] });
  assert.deepEqual(row, {
    name: 'a', kind: 'watch', zone: 'fixFirst', density: 0.8, lift: 2, files: 8,
    severities: { critical: 1, major: 2, minor: 3 },
  });
});

test('reworkSummary keeps the fix first and watch areas and counts both against the areas drawn', () => {
  const ranked = rankedAreas({ areas: [area('hot', 1, 1), area('warm', 0.6, 1), area('calm', 0.1, 1), area('tiny', 2, 1, { kind: 'small' })] });
  const { rows, fixFirst, watch, total } = reworkSummary(ranked);
  assert.deepEqual(names(rows), ['hot', 'warm']);
  assert.deepEqual([fixFirst, watch, total], [1, 1, 4]);
});
