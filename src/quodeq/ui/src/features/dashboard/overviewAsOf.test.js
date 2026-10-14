import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overviewAsOf } from './overviewAsOf.js';

const runs = [
  { runId: 'r4', dateISO: '2026-10-14T08:00:00', status: 'running' },
  { runId: 'r3', dateISO: '2026-10-13T08:00:00', status: 'done' },
  { runId: 'r2', dateISO: '2026-10-10T08:00:00', status: 'failed' },
  { runId: 'r1', dateISO: '2026-10-01T08:00:00', status: 'done' },
];

test('the Overview is on today with no pick, the newest finished run, a running run or an unknown one', () => {
  for (const id of [null, 'latest', 'r3', 'r4', 'nope']) assert.equal(overviewAsOf(id, runs), null, id);
  assert.equal(overviewAsOf('r1', []), null);
});

test('an older finished run is a past day, named by its run and its day', () => {
  assert.deepEqual(overviewAsOf('r1', runs), { runId: 'r1', day: '2026-10-01' });
  assert.deepEqual(overviewAsOf('r2', runs), { runId: 'r2', day: '2026-10-10' });
});
