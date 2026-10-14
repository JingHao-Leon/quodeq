import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCOPE_KIND, openScope, readScope, scopeAsList, scopeFindings, scopeLabel } from './scopeModel.js';

const v = (over) => ({ title: 'T', severity: 'major', file: 'src/a/x.py', line: 10, req: 'R-1', principle: 'P', ...over });
const c = (over) => ({ file: 'src/a/x.py', line: 4, req: 'R-1', principle: 'P', ...over });

function dims() {
  return [
    { dimension: 'reliability', fromRunId: 'run-1',
      violations: [v({}), v({ file: 'src/a/b/y.py', severity: 'minor', req: 'R-2' }), v({ file: 'src/ab/z.py', severity: 'critical' })],
      compliance: [c({}), c({ file: 'src/c/w.py' })] },
    { dimension: 'security', fromRunId: 'run-2', violations: [v({ file: 'src/a/x.py', req: 'S-1' })], compliance: [] },
  ];
}

const files = (file) => [...Object.values(file.violationsBySeverity).flat(), ...file.compliance].map((i) => i.file).sort();

test('readScope reads each kind with its own fields', () => {
  assert.deepEqual(readScope({ kind: 'file', path: 'src/a.py' }), { kind: 'file', path: 'src/a.py', filter: null });
  assert.deepEqual(readScope({ kind: 'folder', path: 'src/a//' }), { kind: 'folder', path: 'src/a', filter: null });
  assert.deepEqual(readScope({ kind: 'dimension', dimension: 'security' }), { kind: 'dimension', dimension: 'security', filter: null });
  assert.deepEqual(readScope({ kind: 'requirement', dimension: 'security', req: 'S-1' }),
    { kind: 'requirement', dimension: 'security', req: 'S-1', text: '', filter: null });
  assert.deepEqual(readScope({ kind: 'project' }), { kind: 'project', filter: null });
  assert.deepEqual(readScope({ kind: 'area', name: 'api', paths: ['src/api/', '', 3] }), { kind: 'area', name: 'api', paths: ['src/api/'], filter: null });
});

test('readScope refuses a scope missing what its kind needs', () => {
  const bad = [null, 'file', {}, { kind: 'nope' }, { kind: 'file' }, { kind: 'folder', path: '' }, { kind: 'dimension' },
    { kind: 'requirement', dimension: 'security' }, { kind: 'area', name: 'api', paths: [] }];
  for (const p of bad) assert.equal(readScope(p), null, JSON.stringify(p));
});

test('readScope keeps a severity or the compliant checks as the filter, nothing else', () => {
  assert.equal(readScope({ kind: 'project', filter: 'critical' }).filter, 'critical');
  assert.equal(readScope({ kind: 'project', filter: 'compliance' }).filter, 'compliance');
  assert.equal(readScope({ kind: 'project', filter: 'all' }).filter, null);
  assert.equal(readScope({ kind: 'project', filter: 'bogus' }).filter, null);
});

test('scopeFindings keeps a file\'s findings across dimensions, compliance included', () => {
  const file = scopeFindings(readScope({ kind: 'file', path: 'src/a/x.py' }), dims());
  assert.equal(file.file, 'src/a/x.py');
  assert.equal(file.total, 2);
  assert.equal(file.compliance.length, 1);
  assert.equal(file.dimensionsCount, 2);
});

test('scopeFindings keeps a folder\'s findings by path prefix, not a sibling sharing its name', () => {
  const file = scopeFindings(readScope({ kind: 'folder', path: 'src/a' }), dims());
  assert.equal(file.file, 'src/a/');
  assert.deepEqual(files(file), ['src/a/b/y.py', 'src/a/x.py', 'src/a/x.py', 'src/a/x.py']);
});

test('scopeFindings keeps a dimension, a requirement of it, or the whole project', () => {
  assert.equal(scopeFindings(readScope({ kind: 'dimension', dimension: 'security' }), dims()).total, 1);
  const req = scopeFindings(readScope({ kind: 'requirement', dimension: 'reliability', req: 'R-2', text: 'Guard' }), dims());
  assert.equal(req.total, 1);
  assert.equal(req.file, 'R-2 · Guard');
  const project = scopeFindings(readScope({ kind: 'project' }), dims(), 'proj');
  assert.equal(project.file, 'proj');
  assert.equal(project.total, 4);
});

test('scopeFindings keeps an area\'s exact files and folders', () => {
  const file = scopeFindings(readScope({ kind: 'area', name: 'core', paths: ['src/ab/z.py', 'src/c/'] }), dims());
  assert.equal(file.file, 'core');
  assert.deepEqual(files(file), ['src/ab/z.py', 'src/c/w.py']);
});

test('scopeFindings is null when the scope holds nothing', () => {
  assert.equal(scopeFindings(readScope({ kind: 'file', path: 'nowhere.py' }), dims()), null);
  assert.equal(scopeFindings(readScope({ kind: 'project' }), []), null);
});

test('scopeAsList hands each kind to the workbench as its chips', () => {
  assert.deepEqual(scopeAsList(readScope({ kind: 'file', path: 'src/a.py' })), { paths: ['src/a.py'] });
  assert.deepEqual(scopeAsList(readScope({ kind: 'folder', path: 'src/a' })), { paths: ['src/a/'] });
  assert.deepEqual(scopeAsList(readScope({ kind: 'area', name: 'api', paths: ['x/'] })), { area: { name: 'api', paths: ['x/'] } });
  assert.deepEqual(scopeAsList(readScope({ kind: 'dimension', dimension: 'security' })), { dimension: 'security' });
  assert.deepEqual(scopeAsList(readScope({ kind: 'requirement', dimension: 'security', req: 'S-1' })), { dimension: 'security', q: 'S-1' });
  assert.deepEqual(scopeAsList(readScope({ kind: 'project' })), {});
});

test('scopeLabel names each kind as its breadcrumb reads', () => {
  assert.equal(scopeLabel({ kind: 'file', path: 'src/a/x.py' }), 'x.py');
  assert.equal(scopeLabel({ kind: 'folder', path: 'src/a' }), 'src/a/');
  assert.equal(scopeLabel({ kind: 'dimension', dimension: 'Security' }), 'security');
  assert.equal(scopeLabel({ kind: 'requirement', dimension: 'security', req: 'S-1', text: 'Long words' }), 'S-1');
  assert.equal(scopeLabel({ kind: 'project' }), 'project');
  assert.equal(scopeLabel({ kind: 'area', name: 'api', paths: ['x/'] }), 'api');
  assert.equal(scopeLabel(null), null);
});

test('openScope pushes the Violations tab with the scope, today or as of a past run', () => {
  const calls = [];
  const nav = (...args) => calls.push(args);
  assert.equal(openScope(nav, { kind: SCOPE_KIND.PROJECT }), true);
  openScope(nav, { kind: SCOPE_KIND.FILE, path: 'a.py' }, { runId: 'r1', day: '2026-10-01' });
  assert.deepEqual(calls, [
    ['violations', { scope: { kind: 'project' }, asOf: null }],
    ['violations', { scope: { kind: 'file', path: 'a.py' }, asOf: { runId: 'r1', day: '2026-10-01' } }],
  ]);
  assert.equal(openScope(undefined, { kind: SCOPE_KIND.PROJECT }), false);
});
