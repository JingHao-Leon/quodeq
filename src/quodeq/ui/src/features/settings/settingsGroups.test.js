import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelState, connectionsState, aboutState, evaluationState, STATE_TONE, SETTINGS_GROUPS } from './settingsGroups.js';

test('groups come in display order', () => {
  assert.deepEqual(SETTINGS_GROUPS.map((g) => g.id), ['model', 'evaluation', 'connections', 'app', 'about']);
});

test('model: ready names provider and model', () => {
  assert.deepEqual(modelState({ provider: 'claude', model: 'sonnet' }), { tone: STATE_TONE.OK, text: 'claude · sonnet' });
});

test('model: a provider without a model asks for one', () => {
  assert.deepEqual(modelState({ provider: 'ollama', model: '' }), { tone: STATE_TONE.WARN, text: 'ollama · pick a model' });
});

test('model: nothing chosen asks for a provider', () => {
  assert.equal(modelState({ provider: '', model: '' }).text, 'pick a provider');
});

test('connections: signed in, gh, none, loading', () => {
  assert.equal(connectionsState({ account: { signedIn: true, login: 'victor' } }).text, 'signed in as victor');
  assert.equal(connectionsState({ account: { signedIn: false, method: 'gh' } }).text, 'using gh login');
  assert.equal(connectionsState({ account: { signedIn: false, method: 'none' } }).text, 'not signed in');
  assert.equal(connectionsState({ account: undefined }).text, 'checking');
});

test('about: an update waiting warns', () => {
  assert.deepEqual(aboutState({ status: { current: '1.13.1', latest: '1.14.0', update_available: true } }),
    { tone: STATE_TONE.WARN, text: 'v1.13.1 · 1.14.0 available' });
  assert.equal(aboutState({ status: { current: '1.13.1', update_available: false } }).tone, STATE_TONE.OK);
});

test('evaluation: live feed mode', () => {
  assert.equal(evaluationState({ newOnly: false }).text, 'live feed: all findings');
  assert.equal(evaluationState({ newOnly: true }).text, 'live feed: new findings only');
});
