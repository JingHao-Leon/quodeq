import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelledScope, cancelledScopeLabel, cancelledNote } from './cancelledRun.js';

const DONE = ['flexibility', 'maintainability', 'reliability', 'usability'];
const PLANNED = ['flexibility', 'maintainability', 'performance', 'reliability', 'security', 'usability'];
const run = { partial: true, dims: DONE, plannedDims: PLANNED, exitReason: 'signal_SIGTERM', activeSeconds: 16440 };

test('scope: what the run planned but did not finish, and how many it planned', () => {
  assert.deepEqual(cancelledScope(run), { planned: 6, missing: ['performance', 'security'] });
  assert.deepEqual(cancelledScope({ ...run, plannedDims: null }), { planned: null, missing: [] });
});

test('row label: done of planned, or the done count when the plan is unknown', () => {
  assert.equal(cancelledScopeLabel(run), 'cancelled · 4 of 6');
  assert.equal(cancelledScopeLabel({ ...run, plannedDims: undefined }), 'cancelled · 4 dims');
});

test('note: how long, why, what finished, what becomes of the work', () => {
  assert.equal(cancelledNote(run),
    'Cancelled after 4h 34m (stopped by a signal). 4 of 6 dimensions finished; performance and security did not. '
    + 'Not part of the score history; the next run reuses its finished work.');
});

test('note: a plain cancel adds no reason, an unknown time no duration', () => {
  const plain = cancelledNote({ ...run, exitReason: 'cancelled', activeSeconds: null });
  assert.match(plain, /^Cancelled\. 4 of 6 dimensions finished;/);
  assert.match(cancelledNote({ ...run, exitReason: 'some_future_code' }), /^Cancelled after 4h 34m\. /);
  assert.match(cancelledNote({ ...run, activeSeconds: 0 }), /^Cancelled \(stopped by a signal\)\. /);
});

test('note: without a plan it counts what finished; with nothing missing it names none', () => {
  assert.match(cancelledNote({ ...run, plannedDims: null }), /\. 4 dimensions finished\. Not part/);
  assert.match(cancelledNote({ ...run, plannedDims: null, dims: ['security'] }), /\. 1 dimension finished\. /);
  assert.match(cancelledNote({ ...run, plannedDims: DONE }), /\. 4 of 4 dimensions finished\. Not part/);
});
