import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrincipleSeries, createSeriesPrinciple } from './principleSeries.js';

test('createSeriesPrinciple: keeps the score, grade and counts the server sent', () => {
  const raw = { principle: 'Integrity', score: 7.5, grade: 'Good', critical: 1, majors: 3, violations: 6 };
  assert.deepEqual(createSeriesPrinciple(raw), raw);
});

test('createSeriesPrinciple: unknown counts and a missing score read as null, never zero', () => {
  assert.deepEqual(createSeriesPrinciple({ principle: 'Integrity', score: null, grade: 'Insufficient', critical: null }), {
    principle: 'Integrity', score: null, grade: 'Insufficient', critical: null, majors: null, violations: null,
  });
});

test('createPrincipleSeries: rows keep their order and a row without principles has none', () => {
  const series = createPrincipleSeries({
    dimension: 'security',
    rows: [
      { runId: 'r2', dateISO: '2026-10-02T10:00:00Z', dateLabel: '2 Oct', principles: [{ principle: 'P', score: '6.5' }] },
      { runId: 'r1', dateISO: '2026-10-01T10:00:00Z', dateLabel: '1 Oct' },
    ],
  });
  assert.deepEqual(series.rows.map((r) => r.runId), ['r2', 'r1']);
  assert.equal(series.rows[0].principles[0].score, 6.5);
  assert.deepEqual(series.rows[1].principles, []);
  assert.deepEqual(createPrincipleSeries({}).rows, []);
});
