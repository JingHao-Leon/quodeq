import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeScope, openPastScope, areaScope, areaFindingsScope } from './detailScopes.js';

test('a node\'s details: a file, a folder, the project at the root', () => {
  assert.deepEqual(nodeScope({ path: 'src/a.py', isFile: true }), { kind: 'file', path: 'src/a.py' });
  assert.deepEqual(nodeScope({ path: 'src', isFile: false }), { kind: 'folder', path: 'src' });
  assert.deepEqual(nodeScope({ path: '', isFile: false }), { kind: 'project' });
});

test('a past day opens the scope as of its run, and nothing without a named run', () => {
  const calls = [];
  const nav = (...a) => calls.push(a);
  const area = { kind: 'area', name: 'api', paths: ['src/api/a.py'] };
  assert.equal(openPastScope(nav, area, { runId: 'r2', day: '2026-09-01' }), true);
  assert.equal(openPastScope(nav, area, { runId: null, day: '2026-09-02' }), false);
  assert.deepEqual(calls, [['violations', { scope: area, asOf: { runId: 'r2', day: '2026-09-01' } }]]);
});

test('an area\'s scope: its paths, the small flag, and a filtered sky\'s selection', () => {
  assert.deepEqual(areaScope({ name: 'api', kind: 'small' }, ['src/api/']), { kind: 'area', name: 'api', paths: ['src/api/'], small: true });
  assert.deepEqual(areaScope({ name: 'api', kind: 'hotspot' }, ['src/api/'], { dimensions: ['security'], principle: 'Authenticity' }), {
    kind: 'area', name: 'api', paths: ['src/api/'], small: false, dimensions: ['security'], principle: 'Authenticity',
  });
});

test('an area\'s findings today: the path chips that hold its files', () => {
  const files = [{ path: 'src/api/a.py', area: 'api' }, { path: 'src/ui/b.js', area: 'ui' }];
  assert.deepEqual(areaFindingsScope({ name: 'api', kind: 'watch' }, files, { dimensions: ['security'] }), {
    kind: 'area', name: 'api', paths: ['src/api/'], small: false, dimensions: ['security'],
  });
});
