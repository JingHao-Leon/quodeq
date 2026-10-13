import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hierarchy } from 'd3-hierarchy';
import { pickUnderPointer, keepCircle } from './packPick.js';

const root = hierarchy({ name: '', children: [{ name: 'src', children: [{ name: 'a.py' }, { name: 'ui', children: [{ name: 'b.js' }] }] }, { name: 'docs', children: [{ name: 'c.md' }] }] });
const byName = new Map(root.descendants().map((n) => [n.data.name, n]));

test('the circle under the pointer is picked at any depth, inside or outside the open folder', () => {
  assert.equal(pickUnderPointer(byName.get('b.js'), root), byName.get('b.js'));
  assert.equal(pickUnderPointer(byName.get('ui'), root), byName.get('ui'));
  assert.equal(pickUnderPointer(byName.get('c.md'), byName.get('src')), byName.get('c.md'));
});

test('the open folder itself, or no circle, picks nothing', () => {
  assert.equal(pickUnderPointer(byName.get('src'), byName.get('src')), null);
  assert.equal(pickUnderPointer(null, byName.get('src')), null);
});

test('the veil keeps the hovered pick, else the folder you are in', () => {
  assert.equal(keepCircle(byName.get('ui'), byName.get('src')), byName.get('ui'));
  assert.equal(keepCircle(null, byName.get('src')), byName.get('src'));
  assert.equal(keepCircle(null, root), null);
});
