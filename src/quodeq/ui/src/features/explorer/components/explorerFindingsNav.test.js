import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExplorerFindingsNav, explorerAsOf } from './explorerFindingsNav.js';

const trend = [{ runId: 'r9', dateISO: '2026-10-12T10:00:00' }, { runId: 'r5', dateISO: '2026-09-30T10:00:00' }];

function navFor(over) {
  const calls = [];
  const nav = buildExplorerFindingsNav({
    dimension: 'security', scoped: { latestRunId: 'r9' }, dimFile: { file: 'security' }, onNavigate: (...a) => calls.push(a),
    project: 'p', activeRunId: 'r9', activeDateLabel: '12 Oct', sourceTab: 'overview', trend, ...over,
  });
  return { nav, calls };
}

test('explorerAsOf: the dimension\'s latest run, or no run, is today; any other run is that run', () => {
  assert.equal(explorerAsOf('r9', 'r9', trend), null);
  assert.equal(explorerAsOf(null, 'r9', trend), null);
  assert.deepEqual(explorerAsOf('r5', 'r9', trend), { runId: 'r5', day: '2026-09-30' });
  assert.deepEqual(explorerAsOf('r5', null, []), { runId: 'r5', day: null });
});

test('on today the cards, the badges and the files table open scoped views of today', () => {
  const { nav, calls } = navFor({});
  nav.handleCardNavigate('violations');
  nav.onSeverityBadge('critical')();
  nav.handleCardNavigate('compliance');
  nav.onFileClick({ file: 'src/a.py' });
  assert.deepEqual(calls, [
    ['violations', { scope: { kind: 'dimension', dimension: 'security', filter: null }, asOf: null }],
    ['violations', { scope: { kind: 'dimension', dimension: 'security', filter: 'critical' }, asOf: null }],
    ['violations', { scope: { kind: 'dimension', dimension: 'security', filter: 'compliance' }, asOf: null }],
    ['violations', { scope: { kind: 'file', path: 'src/a.py' }, asOf: null }],
  ]);
});

test('on a past run (a history bar) they open that run, read-only', () => {
  const { nav, calls } = navFor({ activeRunId: 'r5' });
  nav.onSeverityBadge('major')();
  nav.onFileClick({ file: 'src/a.py' });
  assert.deepEqual(calls.map((c) => c[1].asOf), [{ runId: 'r5', day: '2026-09-30' }, { runId: 'r5', day: '2026-09-30' }]);
});

test('a cross-project explorer keeps the File page of its own project', () => {
  const { nav, calls } = navFor({ scoped: null });
  nav.handleCardNavigate('violations');
  nav.onFileClick({ file: 'src/a.py' });
  const at = { runId: 'r9', dateLabel: '12 Oct', sourceTab: 'overview', fromProject: 'p' };
  assert.deepEqual(calls, [
    ['file', { file: { file: 'security' }, severityFilter: 'all', ...at }],
    ['file', { file: { file: 'src/a.py' }, ...at }],
  ]);
});
