import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hierarchy } from 'd3-hierarchy';
import { pickAtFocusLevel, keepCircle } from './packPick.js';

const root = hierarchy({ name: '', children: [{ name: 'src', children: [{ name: 'a.py' }, { name: 'ui', children: [{ name: 'b.js' }] }] }, { name: 'docs', children: [{ name: 'c.md' }] }] });
const byName = new Map(root.descendants().map((n) => [n.data.name, n]));

test('a file is picked only inside its own folder; elsewhere its folder is', () => {
  assert.equal(pickAtFocusLevel(byName.get('b.js'), root), byName.get('src'));
  assert.equal(pickAtFocusLevel(byName.get('b.js'), byName.get('src')), byName.get('ui'));
  assert.equal(pickAtFocusLevel(byName.get('b.js'), byName.get('ui')), byName.get('b.js'));
});

test('a circle outside the focused folder picks nothing', () => {
  assert.equal(pickAtFocusLevel(byName.get('c.md'), byName.get('src')), null);
});

test('the veil keeps the hovered pick, else the folder you are in', () => {
  assert.equal(keepCircle(byName.get('ui'), byName.get('src')), byName.get('ui'));
  assert.equal(keepCircle(null, byName.get('src')), byName.get('src'));
  assert.equal(keepCircle(null, root), null);
});
