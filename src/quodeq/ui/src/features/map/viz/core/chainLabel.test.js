import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainLabel } from './chainLabel.js';

test('a collapsed chain shows its last segment', () => {
  assert.equal(chainLabel('main/java/nl/dpg/article'), 'article');
  assert.equal(chainLabel('src'), 'src');
  assert.equal(chainLabel(''), '');
});
