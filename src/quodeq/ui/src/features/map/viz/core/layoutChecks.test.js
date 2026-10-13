import { test } from 'node:test';
import assert from 'node:assert/strict';
import { childrenOutside, maxSiblingOverlap, folderMovements, percentile } from './layoutChecks.js';

const PARENT = Int32Array.from([-1, 0, 0]);

test('a child poking out of its parent is counted', () => {
  assert.equal(childrenOutside(PARENT, Float32Array.from([0, 0, 10, 0, 0, 2, 9, 0, 2])), 1);
  assert.equal(childrenOutside(PARENT, Float32Array.from([0, 0, 10, -3, 0, 2, 3, 0, 2])), 0);
});

test('sibling overlap is measured in layout units, absent circles ignored', () => {
  assert.equal(maxSiblingOverlap(PARENT, Float32Array.from([0, 0, 10, -1, 0, 2, 1, 0, 2])), 2);
  assert.equal(maxSiblingOverlap(PARENT, Float32Array.from([0, 0, 10, -1, 0, 0, 1, 0, 2])), 0);
});

test('folder movement is a share of the map width', () => {
  const a = Float32Array.from([300, 300, 300, 0, 0, 1, 0, 0, 1]);
  const b = Float32Array.from([306, 300, 300, 0, 0, 1, 0, 0, 1]);
  assert.deepEqual(folderMovements(PARENT, a, b), [0.01]);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 3);
});
