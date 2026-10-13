import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPackFolder } from './packNode.js';

test('a node is a folder only when it has children', () => {
  assert.equal(isPackFolder({ children: [{}] }), true);
  assert.equal(isPackFolder({ children: [] }), false);
  assert.equal(isPackFolder({}), false);
});
