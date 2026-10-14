import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestRunOf, latestFilesReadOf, liveFileFor, liveEvalPrincipalFor } from './liveSelectors.js';

// The File and Principle pages used to render only the object the navigation
// call built from the payload the client held at click time. A selector in
// the nav params lets the page rebuild that object from the live payload, so
// a refreshed /scores reaches the page instead of a stale snapshot.

const violation = (file, line, req, principle, severity = 'major') => ({ file, line, req, principle, severity, title: `${req} ${file}` });

function accumulated() {
  return {
    dimensions: [
      {
        dimension: 'security', fromRunId: 'run-9', fromDateLabel: '5 Oct',
        principles: [{ name: 'P1', grade: 'B', score: 7.5 }, { name: 'P2', grade: 'C', score: 6 }],
        violations: [violation('a.py', 1, 'S-1', 'P1'), violation('b.py', 2, 'S-1', 'P2'), violation('c.py', 3, 'S-2', 'P1')],
        compliance: [{ file: 'd.py', line: 4, principle: 'P1', title: 'ok' }],
      },
      { dimension: 'perf', fromRunId: 'run-8', principles: [], violations: [], compliance: [] },
    ],
  };
}

test('liveFileFor: a dimension selector rebuilds the dimension file from the live payload', () => {
  const file = liveFileFor({ fileSelector: { kind: 'dimension', dimension: 'security' }, file: { file: 'stale', total: 99 } }, accumulated());
  assert.equal(file.file, 'security');
  assert.equal(file.total, 3);
});

test('liveFileFor: a requirement or folder selector is no longer read (they open as scoped Findings views)', () => {
  assert.equal(liveFileFor({ fileSelector: { kind: 'type', dimension: 'security', req: 'S-1' } }, accumulated()), null);
  assert.equal(liveFileFor({ fileSelector: { kind: 'folder', dir: 'src/x', dimensions: ['security'] } }, accumulated()), null);
});

test('liveFileFor: no selector, no payload or an unknown dimension yields null so the snapshot is used', () => {
  assert.equal(liveFileFor({ file: { file: 'snap' } }, accumulated()), null);
  assert.equal(liveFileFor({ fileSelector: { kind: 'dimension', dimension: 'security' } }, null), null);
  assert.equal(liveFileFor({ fileSelector: { kind: 'dimension', dimension: 'gone' } }, accumulated()), null);
});

test('liveEvalPrincipalFor: rebuilds the principal with its grade, lists and the dimension run', () => {
  const principal = liveEvalPrincipalFor({ principleSelector: { dimension: 'security', principle: 'P1' } }, accumulated());
  assert.equal(principal.principle, 'P1');
  assert.equal(principal.grade, 'B');
  assert.equal(principal.runId, 'run-9');
  assert.deepEqual(principal.principleData.violations.map((v) => v.file), ['a.py', 'c.py']);
  assert.deepEqual(principal.principleData.compliance.map((c) => c.file), ['d.py']);
});

test('liveEvalPrincipalFor: no selector or an unknown principle yields null', () => {
  assert.equal(liveEvalPrincipalFor({ evalPrincipal: { principle: 'snap' } }, accumulated()), null);
  assert.equal(liveEvalPrincipalFor({ principleSelector: { dimension: 'security', principle: 'P9' } }, accumulated()), null);
  assert.equal(liveEvalPrincipalFor({ principleSelector: { dimension: 'security', principle: 'P1' } }, undefined), null);
});

test('latestRunOf: today\'s run of a dimension, never the selected run\'s', () => {
  const props = { dashboardData: { latestAccumulated: accumulated(), accumulated: { dimensions: [{ dimension: 'security', fromRunId: 'old' }] } } };
  assert.equal(latestRunOf(props, 'security'), 'run-9');
  assert.equal(latestRunOf(props, 'gone'), null);
  assert.equal(latestRunOf({ dashboardData: { accumulated: accumulated() } }, 'security'), null);
});

test('latestFilesReadOf: the files today\'s run of a dimension read, null when unknown', () => {
  const props = { dashboardData: { latestAccumulated: { dimensions: [{ dimension: 'security', filesRead: 158 }, { dimension: 'reliability' }] } } };
  assert.equal(latestFilesReadOf(props, 'security'), 158);
  assert.equal(latestFilesReadOf(props, 'reliability'), null);
  assert.equal(latestFilesReadOf(props, 'gone'), null);
  assert.equal(latestFilesReadOf({}, 'security'), null);
});
