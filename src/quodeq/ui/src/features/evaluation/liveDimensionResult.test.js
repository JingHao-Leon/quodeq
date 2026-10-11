import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDimensionResult } from './liveDimensionResult.js';

test('reads "8.4/10" and its grade', () => {
  assert.deepEqual(parseDimensionResult({ overallScore: '8.4/10', overallGrade: 'Good' }), { score: 8.4, grade: 'Good' });
});

test('reads a numeric score', () => {
  assert.deepEqual(parseDimensionResult({ overallScore: 9.1, overallGrade: null }), { score: 9.1, grade: null });
});

test('no score, no result (a frame with only the dimension name)', () => {
  assert.equal(parseDimensionResult({ dimension: 'security' }), null);
  assert.equal(parseDimensionResult(undefined), null);
});
