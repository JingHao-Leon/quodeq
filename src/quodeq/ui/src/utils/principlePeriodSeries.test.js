import test from 'node:test';
import assert from 'node:assert/strict';
import { principlePeriodSeries, principlePeriodDelta } from './principlePeriodSeries.js';

const P1 = 'Integrity';

const point = (score, critical, majors, violations) => ({ principle: P1, score, grade: 'Good', critical, majors, violations });
const row = (runId, dateISO, principles) => ({ runId, dateISO, dateLabel: dateISO.slice(0, 10), principles });

// The endpoint's rows, newest first. Weeks: p1/p2 in W18, p3 in W16, p4/p5 in W13.
// Months: p1 in May, p2/p3 in Apr, p4/p5 in Mar.
const ROWS = [
  row('p1', '2026-05-02T12:00:00', [point(8.0, 0, 1, 2)]),
  row('p2', '2026-04-30T12:00:00', [point(7.5, 0, 2, 4)]),
  row('p3', '2026-04-14T12:00:00', [point(7.0, 1, 3, 6)]),
  row('p4', '2026-03-25T12:00:00', [point(6.0, 1, 4, 8)]),
  row('p5', '2026-03-23T12:00:00', [point(5.0, 2, 5, 9)]),
];

test('principlePeriodSeries: day keeps one point per run, oldest first, with its counts', () => {
  const s = principlePeriodSeries(ROWS, P1, 'day');
  assert.deepEqual(s.map((p) => p.runId), ['p5', 'p4', 'p3', 'p2', 'p1']);
  assert.deepEqual(s[4], { runId: 'p1', dateISO: '2026-05-02T12:00:00', dateLabel: '2026-05-02',
    score: 8.0, grade: 'Good', critical: 0, majors: 1, violations: 2 });
});

test('principlePeriodSeries: week and month keep the newest run per bucket', () => {
  assert.deepEqual(principlePeriodSeries(ROWS, P1, 'week').map((p) => p.runId), ['p4', 'p3', 'p1']);
  assert.deepEqual(principlePeriodSeries(ROWS, P1, 'month').map((p) => p.runId), ['p4', 'p2', 'p1']);
});

test('principlePeriodSeries: a run that did not score the principle hands its bucket to the older run that did', () => {
  const rows = [
    row('other', '2026-05-02T18:00:00', [{ principle: 'Confidentiality', score: 9, grade: 'Good' }]),
    row('unscored', '2026-05-02T16:00:00', [{ principle: P1, score: null, grade: 'Insufficient' }]),
    ...ROWS,
  ];
  assert.equal(principlePeriodSeries(rows, P1, 'day').at(-1).runId, 'p1');
});

test('principlePeriodSeries: limit keeps the newest buckets; unknown counts read as null', () => {
  const rows = [row('n', '2026-05-03T10:00:00', [{ principle: P1, score: 8.5, grade: 'Good', critical: null }]), ...ROWS];
  const s = principlePeriodSeries(rows, P1, 'day', 2);
  assert.deepEqual(s.map((p) => p.runId), ['p1', 'n']);
  assert.deepEqual([s[1].critical, s[1].majors, s[1].violations], [null, null, null]);
});

test('principlePeriodSeries: no principle or no rows give no points', () => {
  assert.deepEqual(principlePeriodSeries(ROWS, ''), []);
  assert.deepEqual(principlePeriodSeries([], P1), []);
  assert.deepEqual(principlePeriodSeries(undefined, P1), []);
});

test('principlePeriodDelta: the change since the previous bucket at each granularity', () => {
  assert.deepEqual(principlePeriodDelta(ROWS, P1, 'day'), { score: 0.5, critical: 0, majors: -1, violations: -2 });
  assert.deepEqual(principlePeriodDelta(ROWS, P1, 'week'), { score: 1.0, critical: -1, majors: -2, violations: -4 });
  assert.deepEqual(principlePeriodDelta(ROWS, P1, 'month'), { score: 0.5, critical: 0, majors: -1, violations: -2 });
});

test('principlePeriodDelta: all null without a previous bucket; a count null when either bucket lacks it', () => {
  const none = { score: null, critical: null, majors: null, violations: null };
  assert.deepEqual(principlePeriodDelta(ROWS.slice(0, 1), P1), none);
  assert.deepEqual(principlePeriodDelta([], P1), none);
  const rows = [row('n', '2026-05-03T10:00:00', [{ principle: P1, score: 9.0, grade: 'Good' }]), ...ROWS];
  assert.deepEqual(principlePeriodDelta(rows, P1), { score: 1.0, critical: null, majors: null, violations: null });
});
