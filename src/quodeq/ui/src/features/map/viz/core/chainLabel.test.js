import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainLabel, circlePath, circleTitle } from './chainLabel.js';

test('a collapsed chain reads its first segment that names something', () => {
  assert.equal(chainLabel('feature-feed/src'), 'feature-feed');
  assert.equal(chainLabel('src/quodeq/ui'), 'quodeq');
  assert.equal(chainLabel('ui'), 'ui');
});

test('container folders and a JVM package root are passed over; all containers read the last segment', () => {
  assert.equal(chainLabel('main/java/nl/x/edition/article'), 'article');
  assert.equal(chainLabel('main/java/nl/x/edition'), 'edition');
  assert.equal(chainLabel('src'), 'src');
  assert.equal(chainLabel(''), '');
});

test('a file is titled by its own name, a folder chain by its label', () => {
  assert.equal(circlePath({ path: 'src/ui/', name: 'ui' }), 'src/ui');
  assert.equal(circleTitle({ path: 'src/ui/b.js', name: 'b.js', isFile: true }), 'b.js');
  assert.equal(circleTitle({ name: 'pkg/mod' }), 'mod');
  assert.equal(circleTitle({ path: 'app/feature-feed/src/', name: 'feature-feed/src', children: [{}] }), 'feature-feed');
});
