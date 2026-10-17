import test from 'node:test';
import assert from 'node:assert/strict';
import { FINDING_STATUS } from '../violationsVocab.js';
import { flattenFindings } from './workbenchModel.js';
import { collapseSingle, folderLevel, parentFolder, pathSuggestions } from './folderModel.js';
import { makeDims } from './_workbench.fixtures.js';

const open = () => flattenFindings(makeDims(), []).filter((f) => f.status === FINDING_STATUS.OPEN);

test('pathSuggestions: folders and files containing the text, with counts, most first', () => {
  const s = pathSuggestions(open(), 'src/a');
  assert.deepEqual(s[0], ['src/a/', 3]);
  assert.ok(s.some(([p, n]) => p === 'src/a/x.py' && n === 2));
  assert.deepEqual(pathSuggestions(open(), 's'), []);
});

test('folderLevel at the root: one src/ folder with every count, the file-less finding as a root file', () => {
  const lvl = folderLevel(open(), '');
  assert.deepEqual(lvl.folders.map((c) => c.path), ['src/']);
  assert.equal(lvl.folders[0].total, 4);
  assert.equal(lvl.files.length, 1);
  assert.equal(lvl.files[0].items[0].title, 'No file at all');
});

test('folderLevel inside src/: worst folder first, then no direct files', () => {
  const lvl = folderLevel(open(), 'src/');
  assert.deepEqual(lvl.folders.map((c) => c.path), ['src/c/', 'src/a/']);
  assert.deepEqual(lvl.folders[1], { path: 'src/a/', total: 3, critical: 0, major: 2, minor: 1 });
  assert.equal(lvl.files.length, 0);
});

test('folderLevel inside src/a/: subfolder b/ then the file x.py with its two findings', () => {
  const lvl = folderLevel(open(), 'src/a/');
  assert.deepEqual(lvl.folders.map((c) => c.path), ['src/a/b/']);
  assert.equal(lvl.files[0].key, 'src/a/x.py');
  assert.equal(lvl.files[0].items.length, 2);
});

test('collapseSingle skips a folder made of one folder and nothing else', () => {
  const list = open().filter((f) => f.file);
  assert.equal(collapseSingle(list, ''), 'src/');
  assert.equal(collapseSingle(list, 'src/a/'), 'src/a/');
});

test('parentFolder', () => {
  assert.equal(parentFolder('src/a/x.py'), 'src/a/');
  assert.equal(parentFolder('x.py'), null);
  assert.equal(parentFolder(''), null);
});
