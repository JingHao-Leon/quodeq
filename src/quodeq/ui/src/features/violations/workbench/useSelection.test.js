import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelection } from './useSelection.js';

test('resolveSelection: the wanted id while visible, the first row with no history', () => {
  assert.equal(resolveSelection(['a', 'b'], 'b', null), 'b');
  assert.equal(resolveSelection(['a', 'b'], 'gone', null), 'a');
  assert.equal(resolveSelection([], 'gone', null), null);
});

test('resolveSelection: a vanished selection takes the row at its index, clamped, and keeps it', () => {
  const prev = { ids: ['a', 'b', 'c'], wanted: 'b', resolved: 'b' };
  assert.equal(resolveSelection(['a', 'c'], 'b', prev), 'c');
  assert.equal(resolveSelection(['a'], 'b', { ids: ['a', 'b'], wanted: 'b', resolved: 'b' }), 'a');
  assert.equal(resolveSelection(['a', 'c', 'd'], 'b', { ids: ['a', 'c'], wanted: 'b', resolved: 'c' }), 'c');
});
