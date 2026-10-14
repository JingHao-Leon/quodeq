import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAsOf } from './asOf.js';

test('a past day names its run, and its day when given', () => {
  assert.deepEqual(readAsOf({ runId: 'r1', day: '2026-08-07' }), { runId: 'r1', day: '2026-08-07' });
  assert.deepEqual(readAsOf({ runId: 'r1' }), { runId: 'r1', day: null });
});

test('anything without a run is no past day', () => {
  for (const bad of [null, undefined, 'r1', {}, { runId: '' }, { runId: 3 }]) assert.equal(readAsOf(bad), null);
});
