import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripStart, scaleMax, countBy, summariseThroughput, runsFromTrend } from './runLogModel.js';

test('strip window centres the selection and stays in range', () => {
  const rows = Array.from({ length: 91 }, (_, i) => ({ runId: `r${i}` }));
  assert.equal(stripStart(rows, 'r0', 20), 0);
  assert.equal(stripStart(rows, 'r30', 20), 20);
  assert.equal(stripStart(rows, 'r90', 20), 71);
  assert.equal(stripStart(rows.slice(0, 5), 'r3', 20), 0);
});

test('scale: linear below the first >3x gap, outliers capped', () => {
  assert.deepEqual(scaleMax([1265, 1132, 200, 95, 19, 0]), { max: 200, cap: 200 });
  assert.deepEqual(scaleMax([95, 60, 30]), { max: 95, cap: Infinity });
  assert.deepEqual(scaleMax([40, 3]), { max: 40, cap: Infinity }); // gap to a value under 10 is not an outlier
  assert.deepEqual(scaleMax([0, 0]), { max: 1, cap: Infinity });
});

test('countBy sorts by count, skips empty values', () => {
  assert.deepEqual(countBy([{ m: 'a' }, { m: 'b' }, { m: 'a' }, { m: null }], 'm'), [['a', 2], ['b', 1]]);
});

test('throughput: files per active minute, per dimension and in total', () => {
  const t = summariseThroughput({ dimensions: [
    { id: 'security', files: { taken: 30 }, filesCached: 5, elapsedS: 60 },
    { id: 'usability', files: { taken: 0 }, elapsedS: 0 },
  ] });
  assert.equal(t.files, 30);
  assert.equal(t.seconds, 60);
  assert.equal(t.perMin, 30);
  assert.equal(t.perDim.security.cached, 5);
  assert.equal(t.perDim.usability.perMin, null);
  assert.equal(summariseThroughput(null).perMin, null);
});

test('runsFromTrend: newest first, run values, partial runs flagged, no comparison', () => {
  const trend = [
    { runId: 'old', dateISO: '2026-10-01T10:00:00Z', runNumericAverage: 7.5, runOverallGrade: 'Adequate', numericAverage: 8, critical: 1, majors: 5, violations: 40,
      dimensionDetails: [{ dimension: 'security', score: 7 }, { dimension: 'reliability', score: 8 }] },
    { runId: 'new', dateISO: '2026-10-03T10:00:00Z', numericAverage: 8.2, overallGrade: 'Good', dimensionDetails: [{ dimension: 'security', score: 8.2 }] },
  ];
  const partialRuns = [{ runId: 'mid', dateISO: '2026-10-02T10:00:00Z', runNumericAverage: 6.5, runOverallGrade: 'Poor', dimensionDetails: [{ dimension: 'usability', score: 6.5 }] }];
  const rows = runsFromTrend(trend, partialRuns);
  assert.deepEqual(rows.map((r) => [r.runId, r.partial]), [['new', false], ['mid', true], ['old', false]]);
  assert.deepEqual(rows[2], {
    runId: 'old', jobId: null, startedAt: '2026-10-01T10:00:00Z', status: 'done', model: null, provider: null, commit: null, origin: null,
    dims: ['reliability', 'security'], partial: false, score: 7.5, grade: 'Adequate', open: 40, critical: 1, majors: 4,
    dimensionDetails: trend[0].dimensionDetails, baselineRunId: null, baselineKind: null, counts: null, newSev: null, resolvedSev: null, pending: false,
  });
  assert.equal(rows[0].score, 8.2);
  assert.equal(rows[0].grade, 'Good');
});

test('runsFromTrend: per-dimension majors exclude criticals, like the run level', () => {
  const trend = [{ runId: 'r', dateISO: '2026-10-01T10:00:00Z', critical: 2, majors: 7,
    dimensionDetails: [{ dimension: 'security', score: 7, critical: 2, majors: 5 }, { dimension: 'usability', score: 8, critical: 0, majors: 2 }] }];
  const [row] = runsFromTrend(trend, []);
  assert.deepEqual(row.dimensionDetails.map((d) => d.majors), [3, 2]);
  assert.equal(row.majors, 5);
});
