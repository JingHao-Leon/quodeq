import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALE } from '../../../../strings/index.js';
import { BAR_VIEW, runX, trendPoints, changeBars, monthTicks, runIndexAt, issueDelta, signedCount, dayDate } from './timelapseBarModel.js';

const RUNS = [
  { day: '2026-08-28', issues: 10, added: 0, fixed: 0 },
  { day: '2026-09-02', issues: 14, added: 6, fixed: 2 },
  { day: '2026-09-20', issues: 12, added: 1, fixed: 3 },
];

test('runs sit in the middle of equal slots', () => {
  assert.equal(runX(0, 4), BAR_VIEW.width / 8);
  assert.equal(runIndexAt(0.99, 3), 2);
  assert.equal(runIndexAt(-1, 3), 0);
});

test('the trend spans its band, most issues at the top', () => {
  const pts = trendPoints(RUNS);
  assert.deepEqual([pts[0].y, pts[1].y], [BAR_VIEW.trendBottom, BAR_VIEW.trendTop]);
});

test('new bars go up and fixed bars down, square-root scaled, none for zero', () => {
  const bars = changeBars(RUNS);
  assert.deepEqual([bars[0].up, bars[0].down], [0, 0]);
  assert.equal(bars[1].up, BAR_VIEW.barMax);
  assert.ok(bars[2].down > bars[2].up && bars[2].up >= BAR_VIEW.barMin);
});

test('a tick marks the first run of each month', () => {
  const september = new Intl.DateTimeFormat(LOCALE, { month: 'short' }).format(dayDate('2026-09-02'));
  assert.deepEqual(monthTicks(RUNS).map((t) => t.index), [0, 1]);
  assert.equal(monthTicks(RUNS)[1].label, september);
});

test('the readout delta is signed', () => {
  assert.deepEqual([issueDelta(RUNS, 0), issueDelta(RUNS, 1), issueDelta(RUNS, 2)], [0, 4, -2]);
  assert.deepEqual([signedCount(4), signedCount(-2), signedCount(0)], ['+4', '−2', '0']);
});
