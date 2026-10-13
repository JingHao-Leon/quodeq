import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaPathFilters, largestFolder } from './areaPaths.js';

const FILES = [
  { path: 'feature-article/src/A.kt', area: 'article' },
  { path: 'feature-article/src/B.kt', area: 'article' },
  { path: 'shared/ArticleUtil.kt', area: 'article' },
  { path: 'shared/Log.kt', area: 'core' },
  { path: 'README.md', area: '(root)' },
];

test('a folder holding only the area becomes one prefix', () => {
  assert.deepEqual(areaPathFilters(FILES, 'article'), ['feature-article/', 'shared/ArticleUtil.kt']);
});

test('a folder shared with another area is never a prefix (no neighbour findings)', () => {
  assert.deepEqual(areaPathFilters(FILES, 'core'), ['shared/Log.kt']);
});

test('a root file is an exact path', () => {
  assert.deepEqual(areaPathFilters(FILES, '(root)'), ['README.md']);
});

test('the largest folder of an area', () => {
  assert.equal(largestFolder(['a/b/x', 'a/b/y', 'a/c/z']), 'a/b');
  assert.equal(largestFolder(['x', 'y']), '');
  assert.equal(largestFolder([]), '');
});
