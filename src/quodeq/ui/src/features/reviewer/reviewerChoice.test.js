import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogDefaultModel, initialModel, readReviewerChoice, writeReviewerChoice } from './reviewerChoice.js';

const fake = (entries = {}) => ({
  data: { ...entries },
  getItem(key) { return key in this.data ? this.data[key] : null; },
  setItem(key, value) { this.data[key] = String(value); },
  removeItem(key) { delete this.data[key]; },
});

test('initialModel keeps a stored model', () => {
  assert.equal(initialModel({ stored: 'opus', catalog: [{ id: 'sonnet', isDefault: true }] }), 'opus');
});

test('initialModel falls back to the catalog default', () => {
  assert.equal(initialModel({ stored: null, catalog: [{ id: 'sonnet', isDefault: true }] }), 'sonnet');
});

test('catalogDefaultModel is null without a default', () => {
  assert.equal(catalogDefaultModel([{ id: 'a' }]), null);
  assert.equal(catalogDefaultModel(undefined), null);
});

test('writeReviewerChoice writes the three keys', () => {
  const s = fake();
  writeReviewerChoice({ providerId: 'claude', model: 'opus', effort: 'high' }, s);
  assert.deepEqual(s.data, {
    'cc-active-provider': 'claude',
    'cc-claude-model': 'opus',
    'cc-claude-effort': 'high',
  });
});

test('writeReviewerChoice clears an empty effort and a missing model', () => {
  const s = fake({ 'cc-claude-effort': 'high', 'cc-claude-model': 'opus' });
  writeReviewerChoice({ providerId: 'claude', model: null, effort: '' }, s);
  assert.deepEqual(s.data, { 'cc-active-provider': 'claude' });
});

test('readReviewerChoice reads back what was stored', () => {
  const s = fake({ 'cc-claude-model': 'opus', 'cc-claude-effort': 'low' });
  assert.deepEqual(readReviewerChoice('claude', s), { providerId: 'claude', model: 'opus', effort: 'low' });
  assert.deepEqual(readReviewerChoice('codex', fake()), { providerId: 'codex', model: null, effort: '' });
});
