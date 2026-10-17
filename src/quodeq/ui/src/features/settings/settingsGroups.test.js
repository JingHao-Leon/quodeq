import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistantState, connectionsState, aboutState, evaluationState, STATE_TONE, SETTINGS_GROUPS } from './settingsGroups.js';

test('groups come in display order', () => {
  assert.deepEqual(SETTINGS_GROUPS.map((g) => g.id), ['evaluation', 'assistant', 'connections', 'app', 'about']);
});

test('evaluation: ready names provider and model', () => {
  assert.deepEqual(evaluationState({ provider: 'claude', model: 'sonnet' }), { tone: STATE_TONE.OK, text: 'claude · sonnet' });
});

test('evaluation: a provider without a model asks for one', () => {
  assert.deepEqual(evaluationState({ provider: 'ollama', model: '' }), { tone: STATE_TONE.WARN, text: 'ollama · pick a model' });
});

test('evaluation: nothing chosen asks for a provider', () => {
  assert.equal(evaluationState({ provider: '', model: '' }).text, 'pick a provider');
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
  assert.equal(aboutState({ status: null, failed: true }).text, 'update check unavailable');
});

test('assistant: off, following the evaluation model, or its own', () => {
  assert.equal(assistantState({ enabled: false, followsAnalysis: true }).text, 'switched off in Toolbar');
  assert.equal(assistantState({ enabled: true, followsAnalysis: true }).text, 'uses the evaluation model');
  assert.deepEqual(assistantState({ enabled: true, followsAnalysis: false, provider: 'codex', model: '' }),
    { tone: STATE_TONE.WARN, text: 'codex · pick a model' });
});
