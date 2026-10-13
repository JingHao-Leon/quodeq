import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimelapseModel } from './timelapseModel.js';

const DATA = {
  fileNames: ['src/app/a.py', 'src/app/b.py', 'docs/x.md', './src/lib/c.py'],
  checks: [Float32Array.from([4, 0, 1, 0]), Float32Array.from([2, 9, 0, 1])],
};

test('nodes are breadth-first with every parent before its children', () => {
  const model = buildTimelapseModel(DATA);
  assert.equal(model.parent[0], -1);
  assert.ok([...model.parent].every((p, i) => i === 0 || p < i));
  assert.equal(model.nodes.length, model.parent.length);
});

test('leaves map to files and carry per-run checks and their largest', () => {
  const model = buildTimelapseModel(DATA);
  const b = model.pathIndex.get('src/app/b.py');
  assert.equal(DATA.fileNames[model.fileOf[b]], 'src/app/b.py');
  assert.deepEqual(model.sizes.map((s) => s[b]), [0, 9]);
  assert.equal(model.maxSize[b], 9);
});

test('paths are spelled like the dashboard tree and chains collapse the same way', () => {
  const model = buildTimelapseModel(DATA);
  assert.ok(model.pathIndex.has('src/lib/c.py'));
  assert.equal(model.nodes[model.pathIndex.get('docs/x.md')].parent.data.name, 'docs');
  assert.equal(model.fileOf[0], -1);
});

test('every build gets its own id', () => {
  assert.notEqual(buildTimelapseModel(DATA).id, buildTimelapseModel(DATA).id);
});

test('siblings are ordered largest whole-history size first, equal sizes by name', () => {
  const data = {
    fileNames: ['d/zz.py', 'd/aa.py', 'd/mm.py', 'd/big.py', 'd/bb.py'],
    checks: [Float32Array.from([1, 1, 5, 20, 1]), Float32Array.from([3, 3, 2, 20, 1])],
  };
  const folder = buildTimelapseModel(data).root.children[0];
  assert.deepEqual(folder.children.map((n) => n.data.name), ['big.py', 'mm.py', 'aa.py', 'zz.py', 'bb.py']);
});
