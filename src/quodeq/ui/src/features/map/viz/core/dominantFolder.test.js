import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dominantFolderPath } from './dominantFolder.js';

const fileLeaf = (path) => ({ path, isFile: true, children: [] });
const dirNode = (path, children) => ({ path, isFile: false, children });

test('a top-level folder with more than 80 % of the files is the one to open', () => {
  const files = Array.from({ length: 9 }, (_, i) => fileLeaf(`app/f${i}`));
  assert.equal(dominantFolderPath(dirNode('', [dirNode('app', files), fileLeaf('README.md')])), 'app');
});

test('no folder dominates: open at the root', () => {
  const half = (p) => Array.from({ length: 5 }, (_, i) => fileLeaf(`${p}/f${i}`));
  assert.equal(dominantFolderPath(dirNode('', [dirNode('a', half('a')), dirNode('b', half('b'))])), null);
  assert.equal(dominantFolderPath(null), null);
});
