import test from 'node:test';
import assert from 'node:assert/strict';
import { nameKey } from './nameKey.js';

test('nameKey reads a name whatever its case, and nothing as empty', () => {
  assert.equal(nameKey('Clean-Architecture'), 'clean-architecture');
  assert.equal(nameKey(null), '');
});
