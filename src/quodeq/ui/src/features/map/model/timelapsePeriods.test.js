import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodEnds, framesByPeriod, periodIndexOf } from './timelapsePeriods.js';
import { GRANULARITY } from '../../../utils/granularity.js';

const run = (day, added = 0, fixed = 0, issues = 0) => ({ day, added, fixed, issues });
// Mon 7 Sep to Sun 13 Sep 2026 is one ISO week; Mon 14 Sep starts the next.
const WEEKS = [run('2026-09-07', 1, 0, 10), run('2026-09-09', 2, 1, 11), run('2026-09-13', 0, 3, 8), run('2026-09-14', 4, 0, 12)];

test('a day is its own period: the history passes through, each frame its own run', () => {
  const frames = framesByPeriod(WEEKS, GRANULARITY.DAY);
  assert.equal(frames.runs, WEEKS);
  assert.deepEqual(frames.ends, [0, 1, 2, 3]);
});

test('weeks follow the ISO week (Monday to Sunday): each ends on its last run and keeps its first day', () => {
  assert.deepEqual(periodEnds(WEEKS, GRANULARITY.WEEK), [{ last: 2, firstDay: '2026-09-07' }, { last: 3, firstDay: '2026-09-14' }]);
});

test('an ISO week across the new year is one week', () => {
  const runs = [run('2025-12-29'), run('2026-01-02'), run('2026-01-05')];
  assert.deepEqual(periodEnds(runs, GRANULARITY.WEEK).map((p) => p.last), [1, 2]);
});

test('months group by calendar month', () => {
  const runs = [run('2026-08-30'), run('2026-09-02'), run('2026-09-28'), run('2026-10-05')];
  assert.deepEqual(periodEnds(runs, GRANULARITY.MONTH), [
    { last: 0, firstDay: '2026-08-30' }, { last: 2, firstDay: '2026-09-02' }, { last: 3, firstDay: '2026-10-05' },
  ]);
});

test('a frame is its period\'s last run, with the new and fixed issues of the whole period', () => {
  const frames = framesByPeriod(WEEKS, GRANULARITY.WEEK);
  assert.deepEqual(frames.ends, [2, 3]);
  assert.deepEqual(frames.runs[0], { day: '2026-09-13', issues: 8, added: 3, fixed: 4, firstDay: '2026-09-07' });
  assert.deepEqual(frames.runs[1], { day: '2026-09-14', issues: 12, added: 4, fixed: 0, firstDay: '2026-09-14' });
});

test('the frame that holds a day: the first whose end is on or after it, else the last', () => {
  const { runs } = framesByPeriod(WEEKS, GRANULARITY.WEEK);
  assert.equal(periodIndexOf(runs, '2026-09-09'), 0);
  assert.equal(periodIndexOf(runs, '2026-09-13'), 0);
  assert.equal(periodIndexOf(runs, '2026-09-14'), 1);
  assert.equal(periodIndexOf(runs, '2026-12-01'), 1);
});

test('an empty history has no frames', () => {
  assert.deepEqual(framesByPeriod([], GRANULARITY.MONTH), { runs: [], ends: [] });
});
