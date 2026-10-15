import { formatRunWhen } from '../../utils/dateFormatting.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  partialDimensionCount, previousPeriodMetrics, weakestDimensionFirst, dimensionPoints, overviewPastRun, modelOfRun,
} from './overviewHeadModel.js';

const dim = (dimension, over = {}) => ({ dimension, filesRead: 100, sourceFileCount: 100, ...over });

test('partialDimensionCount: a dimension counts only when its files read round below 100%', () => {
  const rounding = dim('security', { filesRead: 4205, sourceFileCount: 4209 });
  const partial = dim('reliability', { filesRead: 90, sourceFileCount: 100 });
  const legacy = { dimension: 'usability' };
  assert.equal(partialDimensionCount([rounding, partial, legacy, dim('flexibility')]), 1);
});

test('previousPeriodMetrics: the dimensions on show only, as the tiles read them', () => {
  const totals = (violationCount, critical, complianceCount) => ({ violationCount, complianceCount, severity: { critical, major: violationCount - critical } });
  const scores = { accumulated: { dimensions: [
    dim('Security', { filesRead: 50, totals: totals(10, 1, 30) }),
    dim('hidden', { filesRead: 50, totals: totals(90, 9, 0) }),
  ] } };
  const m = previousPeriodMetrics(scores, new Set(['security']));
  assert.equal(m.violations, 10);
  assert.equal(m.passPct, 75);
  assert.equal(m.per100, 20);
  assert.equal(previousPeriodMetrics(scores, new Set(['other'])), null);
});

test('weakestDimensionFirst: lowest score leads, ungraded last, ties by name', () => {
  const dims = [dim('b', { overallScore: '8.0/10' }), dim('none'), dim('c', { overallScore: '6.5/10' }), dim('a', { overallScore: '8.0/10' })];
  assert.deepEqual([...dims].sort(weakestDimensionFirst).map((d) => d.dimension), ['c', 'a', 'b', 'none']);
});

test('dimensionPoints: one radial point per dimension, ungraded ones without evidence', () => {
  assert.deepEqual(dimensionPoints([dim('a', { overallScore: '7.5/10' }), dim('b')]), [
    { name: 'a', score: 7.5, hasEvidence: true, thin: false },
    { name: 'b', score: null, hasEvidence: false, thin: false },
  ]);
});

test('overviewPastRun: an older run names its day and goes back to the latest finished run', () => {
  const runs = [{ runId: 'r3', status: 'running' }, { runId: 'r2', status: 'done' }, { runId: 'r1', status: 'done' }];
  const picked = [];
  const note = overviewPastRun({ runId: 'r1', day: '2026-10-01' }, runs, (id) => picked.push(id));
  assert.equal(note.when, '2026-10-01');
  note.onBack();
  assert.deepEqual(picked, ['r2']);
  assert.equal(overviewPastRun(null, runs, () => {}), null);
});

test('overviewPastRun: a run with its date reads when it ran, in words, never its id', () => {
  const runs = [{ runId: 'r2', status: 'done' }, { runId: 'r1', status: 'done', dateLabel: '13 Oct 2026' }];
  const trend = [{ runId: 'r1', dateISO: '2026-10-13T04:55:00' }];
  const note = overviewPastRun({ runId: 'r1', day: null }, runs, () => {}, trend);
  assert.equal(note.when, formatRunWhen('2026-10-13T04:55:00'));
  assert.notEqual(note.when, 'r1');
  assert.equal(overviewPastRun({ runId: 'r1', day: null }, runs, () => {}).when, '13 Oct 2026');
});

test('modelOfRun: the run\'s own model, else the newest finished run\'s', () => {
  const log = [{ runId: 'r3', status: 'running' }, { runId: 'r2', status: 'done', model: 'qwen' }, { runId: 'r1', status: 'done', model: 'sonnet' }];
  assert.equal(modelOfRun(log, 'r1'), 'sonnet');
  assert.equal(modelOfRun(log, 'gone'), 'qwen');
  assert.equal(modelOfRun(null, 'r1'), null);
});
