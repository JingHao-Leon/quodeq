import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrendPrinciple, trendDetailPrinciples } from './trendPrinciple.js';

test('createTrendPrinciple: keeps the score, grade and counts the server sent', () => {
  const raw = { principle: 'Integrity', score: 7.5, grade: 'Good', critical: 1, majors: 3, violations: 6 };
  assert.deepEqual(createTrendPrinciple(raw), raw);
});

test('createTrendPrinciple: unknown counts and a missing score read as null, never zero', () => {
  assert.deepEqual(createTrendPrinciple({ principle: 'Integrity', score: null, grade: 'Insufficient', critical: null }), {
    principle: 'Integrity', score: null, grade: 'Insufficient', critical: null, majors: null, violations: null,
  });
});

test('trendDetailPrinciples: a detail from before the field has no principles', () => {
  assert.deepEqual(trendDetailPrinciples({ dimension: 'security', score: 7 }), []);
  assert.deepEqual(trendDetailPrinciples(undefined), []);
  assert.equal(trendDetailPrinciples({ principles: [{ principle: 'P', score: '6.5' }] })[0].score, 6.5);
});
