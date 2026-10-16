import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCell, syncActions, isBuiltinType, SYNC_ACTION } from './standardSync.js';

const T = '2026-10-14T10:00:00Z';

test('syncCell maps every state', () => {
  assert.deepEqual(syncCell({ type: 'custom', syncState: 'published', publishedAt: T }), { tone: 'ok', key: 'standards.syncPublished', time: T });
  assert.deepEqual(syncCell({ type: 'custom', syncState: 'changed', publishedAt: T }), { tone: 'warn', key: 'standards.syncChanged', time: T });
  assert.deepEqual(syncCell({ type: 'custom', syncState: 'update_available', publishedAt: T }), { tone: 'warn', key: 'standards.syncUpdateAvailable', time: null });
  assert.deepEqual(syncCell({ type: 'custom', syncState: 'diverged', publishedAt: T }), { tone: 'warn', key: 'standards.syncDiverged', time: T });
  assert.deepEqual(syncCell({ type: 'custom', syncState: 'never_shared' }), { tone: 'muted', key: null, time: null });
  assert.deepEqual(syncCell({ type: 'custom', syncState: 'remote_only', remote: true }), { tone: 'muted', key: 'standards.syncRemote', time: null });
});

test('syncCell for built-ins and when not connected', () => {
  assert.deepEqual(syncCell({ type: 'iso' }), { tone: 'muted', key: 'standards.syncBuiltin', time: null });
  assert.equal(syncCell({ type: 'custom' }), null);
});

test('syncActions per state', () => {
  const a = (syncState, extra = {}) => syncActions({ type: 'custom', syncState, ...extra });
  assert.deepEqual(a('never_shared'), [{ action: SYNC_ACTION.SHARE, force: false }]);
  assert.deepEqual(a('removed_remotely'), [{ action: SYNC_ACTION.SHARE, force: false }]);
  assert.deepEqual(a('changed'), [{ action: SYNC_ACTION.PUBLISH, force: false }]);
  assert.deepEqual(a('update_available'), [{ action: SYNC_ACTION.UPDATE, force: false }]);
  assert.deepEqual(a('diverged'), [{ action: SYNC_ACTION.PUBLISH, force: true }, { action: SYNC_ACTION.UPDATE, force: true }]);
  assert.deepEqual(a('remote_only', { remote: true }), [{ action: SYNC_ACTION.INSTALL, force: false }]);
  assert.deepEqual(a('published'), []);
  assert.deepEqual(syncActions({ type: 'iso' }), []);
});

test('isBuiltinType is true only for iso, wcag and quodeq', () => {
  assert.equal(isBuiltinType('iso'), true);
  assert.equal(isBuiltinType('wcag'), true);
  assert.equal(isBuiltinType('quodeq'), true);
  assert.equal(isBuiltinType('community'), false);
  assert.equal(isBuiltinType('custom'), false);
  assert.equal(isBuiltinType(undefined), false);
});
