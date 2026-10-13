import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestTreePath } from './treePath.js';

const dir = (path, children) => ({ path, isFile: false, children });
const file = (path) => ({ path, isFile: true, children: [] });
// src/main/java/nl/x collapsed into one node whose path is the deepest folder.
const TREE = dir('', [dir('src/main/java/nl/x', [dir('src/main/java/nl/x/article', [file('src/main/java/nl/x/article/A.java')])]), file('README.md')]);

test('an exact folder node', () => {
  assert.equal(nearestTreePath(TREE, 'src/main/java/nl/x/article'), 'src/main/java/nl/x/article');
});

test('a folder below the deepest node snaps to that node', () => {
  assert.equal(nearestTreePath(TREE, 'src/main/java/nl/x/article/deep/more'), 'src/main/java/nl/x/article');
});

test('a folder above a collapsed chain node has no node of its own: the root', () => {
  assert.equal(nearestTreePath(TREE, 'src/main'), '');
});

test('nothing matches: the root', () => {
  assert.equal(nearestTreePath(TREE, 'elsewhere'), '');
  assert.equal(nearestTreePath(null, 'x'), '');
});
