import test from 'node:test';
import assert from 'node:assert/strict';
import { FINDING_GROUP, FINDING_STATUS } from '../violationsVocab.js';
import { applyFilters, flattenFindings, groupFindings, severityCounts } from './workbenchModel.js';
import { makeDims, makeDismissed } from './_workbench.fixtures.js';

const all = () => flattenFindings(makeDims(), makeDismissed());
const base = { q: '', severity: null, dimension: null, status: FINDING_STATUS.ALL, paths: [] };

test('flattenFindings: open and dismissed in one list, most severe first', () => {
  const list = all();
  assert.equal(list.length, 6);
  assert.equal(list[0].title, 'Swallowed error');
  assert.equal(list.find((f) => f.title === 'Old warning').status, FINDING_STATUS.DISMISSED);
  assert.equal(list.find((f) => f.title === 'Key logged').runId, 'run-2');
  assert.equal(list.find((f) => f.title === 'Key logged').principle, 'Confidentiality');
});

test('flattenFindings: identical findings still get distinct ids', () => {
  const dims = makeDims();
  dims[0].violations.push({ ...dims[0].violations[0] });
  const ids = flattenFindings(dims, []).map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('applyFilters: text matches title, path, rule id and principle, case-insensitive', () => {
  const q = (text) => applyFilters(all(), { ...base, q: text }).map((f) => f.title);
  assert.deepEqual(q('KEY'), ['Key logged']);
  assert.deepEqual(q('src/a/b/'), ['Unchecked return']);
  assert.deepEqual(q('r-ft-1'), ['Swallowed error']);
  assert.deepEqual(q('integrity'), ['No file at all']);
});

test('applyFilters: regex characters are plain text', () => {
  assert.doesNotThrow(() => applyFilters(all(), { ...base, q: 'old.accumulated( [x] \\' }));
  assert.equal(applyFilters(all(), { ...base, q: '(' }).length, 0);
});

test('applyFilters: severity, dimension and status narrow', () => {
  assert.equal(applyFilters(all(), { ...base, severity: 'minor' }).length, 3);
  assert.equal(applyFilters(all(), { ...base, dimension: 'security' }).length, 2);
  assert.equal(applyFilters(all(), { ...base, status: FINDING_STATUS.OPEN }).length, 5);
  assert.equal(applyFilters(all(), { ...base, status: FINDING_STATUS.DISMISSED }).length, 1);
});

test('applyFilters: a folder path takes everything under it, a file path only that file', () => {
  assert.equal(applyFilters(all(), { ...base, paths: ['src/a/'] }).length, 3);
  assert.equal(applyFilters(all(), { ...base, paths: ['src/a/x.py'] }).length, 2);
  assert.equal(applyFilters(all(), { ...base, paths: ['src/a/b/', 'src/c/z.js'] }).length, 2);
});

test('groupFindings: one group per key, worst group first', () => {
  const byFile = groupFindings(all(), FINDING_GROUP.FILE);
  assert.equal(byFile[0].key, 'src/c/z.js');
  assert.equal(byFile.find((g) => g.key === 'src/a/x.py').items.length, 2);
  assert.equal(new Set(byFile.map((g) => g.key)).size, byFile.length);
  const byReq = groupFindings(all(), FINDING_GROUP.REQUIREMENT);
  assert.equal(byReq.find((g) => g.key.startsWith('R-FT-2')).key, 'R-FT-2 · Fault Tolerance');
  assert.deepEqual(groupFindings(all(), FINDING_GROUP.NONE).map((g) => g.key), [null]);
});

test('severityCounts counts each level', () => {
  assert.deepEqual(severityCounts(all()), { critical: 1, major: 2, minor: 3 });
});
