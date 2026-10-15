import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originLabel, originUrl } from './runOrigin.js';

test('origin labels: nightly, PR, app, cli, none', () => {
  assert.equal(originLabel({ kind: 'ci', workflow: 'Quodeq Nightly' }), 'nightly');
  assert.equal(originLabel({ kind: 'ci', pr: 1402 }), 'PR #1402');
  assert.equal(originLabel({ kind: 'app' }), 'app');
  assert.equal(originLabel({ kind: 'cli' }), 'cli');
  assert.equal(originLabel(null), null);
  assert.equal(originUrl({ kind: 'ci', prUrl: 'https://p', runUrl: 'https://r' }), 'https://p');
});
