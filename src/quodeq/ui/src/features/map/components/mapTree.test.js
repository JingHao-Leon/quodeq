import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSubtree, buildBreadcrumbPath, dominantFolderPath } from './mapTree.js';

function node(path, name, children = []) {
  return { path, name, children };
}

const leaf = node('src/app/main.py', 'main.py');
const app = node('src/app', 'app', [leaf]);
const libNode = node('src/lib', 'lib');
const src = node('src', 'src', [app, libNode]);
const root = node('', '(root)', [src]);

test('findSubtree returns the root for an empty path', () => {
  assert.equal(findSubtree(root, ''), root);
  assert.equal(findSubtree(root, null), root);
});

test('findSubtree locates a nested node by exact path', () => {
  assert.equal(findSubtree(root, 'src/app'), app);
  assert.equal(findSubtree(root, 'src/app/main.py'), leaf);
});

test('findSubtree only descends into prefix-matching children', () => {
  // 'src/application' shares the string prefix 'src/app' but is NOT under
  // src/app the directory — the '/'-boundary check must reject it and the
  // lookup falls back to root.
  assert.equal(findSubtree(root, 'src/application'), root);
});

test('findSubtree falls back to the root for an unknown path', () => {
  assert.equal(findSubtree(root, 'does/not/exist'), root);
});

test('buildBreadcrumbPath returns the ancestor chain excluding the root', () => {
  assert.deepEqual(buildBreadcrumbPath(root, 'src/app/main.py'), [
    { name: 'src', path: 'src' },
    { name: 'app', path: 'src/app' },
    { name: 'main.py', path: 'src/app/main.py' },
  ]);
});

test('findSubtree does not throw on a malformed node with no children array', () => {
  const malformed = node('x', 'x');
  delete malformed.children;
  assert.doesNotThrow(() => findSubtree(malformed, 'x/y'));
  assert.equal(findSubtree(malformed, 'x/y'), malformed);
});

test('buildBreadcrumbPath does not throw on a malformed node with no children array', () => {
  const malformed = node('x', 'x');
  delete malformed.children;
  assert.doesNotThrow(() => buildBreadcrumbPath(malformed, 'x/y'));
  assert.deepEqual(buildBreadcrumbPath(malformed, 'x/y'), []);
});

test('buildBreadcrumbPath is empty for no path and stops at the deepest resolvable hop', () => {
  assert.deepEqual(buildBreadcrumbPath(root, ''), []);
  // Unknown leaf under a known folder: crumbs cover the resolvable prefix.
  assert.deepEqual(buildBreadcrumbPath(root, 'src/lib/missing.py'), [
    { name: 'src', path: 'src' },
    { name: 'lib', path: 'src/lib' },
  ]);
});

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
