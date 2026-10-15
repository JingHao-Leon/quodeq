import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRunWhen } from '../../utils/dateFormatting.js';
import {
  runTitle, runSub, runMetrics, severityChanges, scoreChange, runDimensionTrends, runChangeView,
} from './runPageModel.js';

const ISO = '2026-10-08T08:23:00';
// The title and sub line hold each part together: their spaces, but the ones around a dot, do not break.
const held = (text) => text.replace(/(?<!·) (?!·)/g, '\u00a0');
const dim = (dimension, score, sev = {}, extra = {}) => ({
  dimension, overallScore: `${score}/10`, filesRead: 100,
  totals: { severity: sev, violationCount: Object.values(sev).reduce((a, b) => a + b, 0), complianceCount: 50 }, ...extra,
});

test('the title says when the run ran, the day label when its time is unknown', () => {
  assert.equal(runTitle({ dateISO: ISO, dateLabel: '8 Oct 2026' }), `run · ${held(formatRunWhen(ISO))}`);
  assert.equal(runTitle({ dateLabel: '8 Oct 2026' }, ISO), `run · ${held(formatRunWhen(ISO))}`);
  assert.equal(runTitle({ dateLabel: '8 Oct 2026' }), `run · ${held('8 Oct 2026')}`);
  assert.match(runTitle({ dateISO: ISO }), / · .+\u00a0.+ · /);
});

test('the sub line reads origin, model, commit, duration and files, leaving out what is unknown', () => {
  const run = { origin: { kind: 'ci', workflow: 'Quodeq Nightly' }, model: 'qwen', commit: '3e044f3', activeSeconds: 4961, filesAnalysed: 1346 };
  const sub = runSub({ run, selectedRun: {} });
  assert.match(sub, /^nightly · qwen · 3e044f3 · took\u00a0.+ · 1,346\u00a0files$/);
  assert.equal(runSub({ run: null, selectedRun: { commitSha: '3e044f3fca8a45e0' } }), '3e044f3');
  assert.equal(runSub({ run: null, selectedRun: null }), null);
});

test('the tiles change against the previous run: each severity, nothing without a previous run', () => {
  const now = runMetrics([dim('security', 7, { critical: 2, major: 5 })]);
  const before = runMetrics([dim('security', 8, { critical: 1, major: 7, minor: 1 })]);
  assert.deepEqual(severityChanges(now, before), { critical: 1, major: -2, minor: -1 });
  assert.equal(severityChanges(now, null), null);
  assert.equal(runMetrics([]), null);
  assert.equal(runMetrics(null), null);
});

test('the score change is the mean of the dimensions against the previous run\'s', () => {
  const delta = scoreChange([dim('a', 8), dim('b', 6)], [dim('a', 7), dim('b', 6)]);
  assert.ok(Math.abs(delta - 0.5) < 1e-9);
  assert.equal(scoreChange([dim('a', 8)], null), null);
});

test('each dimension changes against the previous run by lowercase name, null where either has no score', () => {
  const trends = runDimensionTrends([dim('Security', 7.5), dim('usability', 9), { dimension: 'flex', overallScore: '—' }], [dim('security', 8)]);
  assert.ok(Math.abs(trends.security.delta + 0.5) < 1e-9);
  assert.equal(trends.usability.delta, null);
  assert.equal(trends.flex.delta, null);
  assert.deepEqual(runDimensionTrends([dim('a', 8)], null), { a: { delta: null } });
});

test('the run diff folds into per-dimension changes and the since line', () => {
  const view = runChangeView({ dimensions: {
    Security: { counts: { new: 4, resolved: 2, newSev: { critical: 1 }, resolvedSev: {} }, types: { opened: ['S-1'], closed: [] } },
    usability: { counts: { new: 0, resolved: 3 } },
  } });
  assert.equal(view.perDim.security.new, 4);
  assert.deepEqual(view.perDim.security.newSev, { critical: 1 });
  assert.equal(view.perDim.usability.resolved, 3);
  assert.deepEqual(view.since, { newCount: 4, resolvedCount: 5, typesOpened: 1, typesClosed: 0 });
});
