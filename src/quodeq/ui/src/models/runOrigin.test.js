import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originLabel, originUrl } from './runOrigin.js';

test('a CI run reads as its nightly or its pull request', () => {
  assert.equal(originLabel({ kind: 'ci', workflow: 'Quodeq Nightly' }), 'nightly');
  assert.equal(originLabel({ kind: 'ci', pr: 1402 }), 'PR #1402');
});

test('an app or CLI run reads as its kind, an unknown origin as nothing', () => {
  assert.equal(originLabel({ kind: 'app' }), 'app');
  assert.equal(originLabel({ kind: 'cli' }), 'cli');
  assert.equal(originLabel(null), null);
});

test('the origin link is the pull request first, and only a web URL', () => {
  assert.equal(originUrl({ kind: 'ci', prUrl: 'https://p', runUrl: 'https://r' }), 'https://p');
  assert.equal(originUrl({ kind: 'ci', prUrl: 'javascript:alert(1)' }), null);
});
