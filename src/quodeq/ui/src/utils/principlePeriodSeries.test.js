import test from 'node:test';
import assert from 'node:assert/strict';
import { principlePeriodSeries, principlePeriodDelta } from './principlePeriodSeries.js';
import { filterTrendByVisibleStandards } from './scoreFiltering.js';

const SEC = 'security';
const P1 = 'Integrity';

const point = (score, critical, majors, violations) => ({ principle: P1, score, grade: 'Good', critical, majors, violations });
const row = (runId, dateISO, principles, extra = {}) => ({
  runId, dateISO, dateLabel: dateISO.slice(0, 10), ...extra,
  dimensionDetails: [{ dimension: SEC, score: 7, principles }],
});

// Newest-first. Weeks: p1/p2 in W18, p3 in W16, p4/p5 in W13. Months: p1 in May, p2/p3 in Apr, p4/p5 in Mar.
const TREND = [
  row('p1', '2026-05-02T12:00:00', [point(8.0, 0, 1, 2)]),
  row('p2', '2026-04-30T12:00:00', [point(7.5, 0, 2, 4)]),
  row('p3', '2026-04-14T12:00:00', [point(7.0, 1, 3, 6)]),
  row('p4', '2026-03-25T12:00:00', [point(6.0, 1, 4, 8)]),
  row('p5', '2026-03-23T12:00:00', [point(5.0, 2, 5, 9)]),
];

test('principlePeriodSeries: day keeps one point per run, oldest first, with its counts', () => {
  const s = principlePeriodSeries(TREND, SEC, P1, 'day');
  assert.deepEqual(s.map((p) => p.runId), ['p5', 'p4', 'p3', 'p2', 'p1']);
  assert.deepEqual(s[4], { runId: 'p1', dateISO: '2026-05-02T12:00:00', dateLabel: '2026-05-02',
    score: 8.0, grade: 'Good', critical: 0, majors: 1, violations: 2 });
});

test('principlePeriodSeries: week and month keep the newest run per bucket', () => {
  assert.deepEqual(principlePeriodSeries(TREND, SEC, P1, 'week').map((p) => p.runId), ['p4', 'p3', 'p1']);
  assert.deepEqual(principlePeriodSeries(TREND, SEC, P1, 'month').map((p) => p.runId), ['p4', 'p2', 'p1']);
});

test('principlePeriodSeries: a run that skipped the dimension hands its bucket to the older run that scored it', () => {
  const trend = [
    { runId: 'skip', dateISO: '2026-05-02T18:00:00', dimensionDetails: [{ dimension: 'reliability', score: 9 }] },
    ...TREND,
  ];
  const s = principlePeriodSeries(trend, 'Security', P1, 'day');
  assert.equal(s.at(-1).runId, 'p1');
});

test('principlePeriodSeries: rows without the field, unscored principles and running runs give no point', () => {
  const trend = [
    { runId: 'live', dateISO: '2026-06-02T10:00:00', status: 'running', dimensionDetails: [{ dimension: SEC, score: 4, principles: [point(1.0, 9, 9, 9)] }] },
    row('unscored', '2026-06-01T10:00:00', [{ principle: P1, score: null, grade: 'Insufficient' }]),
    { runId: 'old', dateISO: '2026-05-31T10:00:00', dimensionDetails: [{ dimension: SEC, score: 6 }] },
    ...TREND,
  ];
  assert.equal(principlePeriodSeries(trend, SEC, P1, 'day').at(-1).runId, 'p1');
});

test('principlePeriodSeries: limit keeps the newest buckets; unknown counts read as null', () => {
  const trend = [row('n', '2026-05-03T10:00:00', [{ principle: P1, score: 8.5, grade: 'Good', critical: null }]), ...TREND];
  const s = principlePeriodSeries(trend, SEC, P1, 'day', 2);
  assert.deepEqual(s.map((p) => p.runId), ['p1', 'n']);
  assert.deepEqual([s[1].critical, s[1].majors, s[1].violations], [null, null, null]);
});

test('principlePeriodDelta: the change since the previous bucket at each granularity', () => {
  assert.deepEqual(principlePeriodDelta(TREND, SEC, P1, 'day'), { score: 0.5, critical: 0, majors: -1, violations: -2 });
  assert.deepEqual(principlePeriodDelta(TREND, SEC, P1, 'week'), { score: 1.0, critical: -1, majors: -2, violations: -4 });
});

test('principlePeriodDelta: all null without a previous bucket; a count null when either bucket lacks it', () => {
  const none = { score: null, critical: null, majors: null, violations: null };
  assert.deepEqual(principlePeriodDelta(TREND.slice(0, 1), SEC, P1), none);
  assert.deepEqual(principlePeriodDelta([], SEC, P1), none);
  const trend = [row('n', '2026-05-03T10:00:00', [{ principle: P1, score: 9.0, grade: 'Good' }]), ...TREND];
  assert.deepEqual(principlePeriodDelta(trend, SEC, P1), { score: 1.0, critical: null, majors: null, violations: null });
});

test('principlePeriodSeries: a hidden standard takes its principles with it; a visible one keeps them', () => {
  assert.deepEqual(principlePeriodSeries(filterTrendByVisibleStandards(TREND, new Set(['reliability'])), SEC, P1), []);
  const visible = principlePeriodSeries(filterTrendByVisibleStandards(TREND, new Set([SEC])), SEC, P1);
  assert.deepEqual(visible, principlePeriodSeries(TREND, SEC, P1));
});
