import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hierarchy } from 'd3-hierarchy';
import { pickUnderPointer } from './packPick.js';

const file = (name) => ({ name, isFile: true });
const root = hierarchy({ name: '', children: [{ name: 'src', children: [file('a.py'), { name: 'ui', children: [file('b.js')] }] }, { name: 'docs', children: [file('c.md')] }] });
const byName = new Map(root.descendants().map((n) => [n.data.name, n]));

test('a folder under the pointer is picked at any depth, inside or outside the open folder', () => {
  assert.equal(pickUnderPointer(byName.get('ui'), root), byName.get('ui'));
  assert.equal(pickUnderPointer(byName.get('docs'), byName.get('src')), byName.get('docs'));
});

test('a file is picked only inside its own folder; elsewhere its folder is', () => {
  assert.equal(pickUnderPointer(byName.get('b.js'), byName.get('ui')), byName.get('b.js'));
  assert.equal(pickUnderPointer(byName.get('b.js'), root), byName.get('ui'));
  assert.equal(pickUnderPointer(byName.get('c.md'), byName.get('src')), byName.get('docs'));
});

test('the open folder itself, or no circle, picks nothing', () => {
  assert.equal(pickUnderPointer(byName.get('src'), byName.get('src')), null);
  assert.equal(pickUnderPointer(byName.get('a.py'), byName.get('src')), byName.get('a.py'));
  assert.equal(pickUnderPointer(null, byName.get('src')), null);
});
