import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainLabel, circlePath, circleTitle } from './chainLabel.js';

test('a collapsed chain shows its last segment', () => {
  assert.equal(chainLabel('main/java/nl/dpg/article'), 'article');
  assert.equal(chainLabel('src'), 'src');
  assert.equal(chainLabel(''), '');
});

test('a circle is titled by the last segment of its path, without a trailing slash', () => {
  assert.equal(circlePath({ path: 'src/ui/', name: 'ui' }), 'src/ui');
  assert.equal(circleTitle({ path: 'src/ui/b.js', name: 'b.js' }), 'b.js');
  assert.equal(circleTitle({ name: 'pkg/mod' }), 'mod');
});
