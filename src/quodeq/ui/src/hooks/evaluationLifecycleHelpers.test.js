import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubagentModel, safeGetItem } from './evaluationLifecycleHelpers.js';

function getFrom(values) {
  return (key) => values[key] || '';
}

function throwingStorage() {
  return { getItem: () => { throw new Error('storage unavailable'); } };
}

test('resolveSubagentModel: a separate analysis model wins over the main model', () => {
  assert.equal(resolveSubagentModel({ get: getFrom({ model: 'main', 'model-analysis': 'small' }) }), 'small');
});

test('resolveSubagentModel: falls back to the main model', () => {
  assert.equal(resolveSubagentModel({ get: getFrom({ model: 'main' }) }), 'main');
});

test('resolveSubagentModel: undefined when no model is set', () => {
  assert.equal(resolveSubagentModel({ get: getFrom({}) }), undefined);
});

test('safeGetItem: degrades to an empty string when the store throws', () => {
  assert.equal(safeGetItem(throwingStorage(), 'k'), '');
});
