import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPeriodLabel } from './formatters.js';

const E = { dateISO: '2026-03-25T14:00:00', dateLabel: '25 Mar 2026' };

test('day granularity shows the specific date label', () => {
  assert.equal(formatPeriodLabel(E, 'day'), '25 Mar 2026');
  assert.equal(formatPeriodLabel(E), '25 Mar 2026'); // default day
});

test('month granularity shows month name + year', () => {
  assert.equal(formatPeriodLabel(E, 'month'), 'March 2026');
});

test('week granularity shows the Monday..Sunday range of the ISO week', () => {
  assert.equal(formatPeriodLabel(E, 'week'), '23\u2009–\u200929 Mar 2026');
  // Monday and Sunday name their own week.
  assert.equal(formatPeriodLabel({ dateISO: '2026-03-23T00:00:00' }, 'week'), '23\u2009–\u200929 Mar 2026');
  assert.equal(formatPeriodLabel({ dateISO: '2026-03-29T23:00:00' }, 'week'), '23\u2009–\u200929 Mar 2026');
});

test('week granularity spells out a month or year the range crosses', () => {
  assert.equal(formatPeriodLabel({ dateISO: '2026-07-29T12:00:00' }, 'week'), '27 Jul\u2009–\u20092 Aug 2026');
  assert.equal(formatPeriodLabel({ dateISO: '2025-12-31T12:00:00' }, 'week'), '29 Dec 2025\u2009–\u20094 Jan 2026');
});

test('week granularity falls back to dateLabel on a malformed date', () => {
  assert.equal(formatPeriodLabel({ dateISO: '2026-02-31', dateLabel: 'odd' }, 'week'), 'odd');
});

test('falls back to dateLabel when dateISO is missing', () => {
  assert.equal(formatPeriodLabel({ dateLabel: 'Latest' }, 'month'), 'Latest');
  assert.equal(formatPeriodLabel({ dateLabel: 'Latest' }, 'week'), 'Latest');
});
