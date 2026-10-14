import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskMapParams } from './riskLinks.js';

test('riskMapParams opens the Risk tab unfiltered by default', () => {
  assert.deepEqual(riskMapParams(), { vizStyle: 'risk' });
  assert.deepEqual(riskMapParams({ dimensions: [] }), { vizStyle: 'risk' });
});

test('riskMapParams filters to dimensions with an area selected', () => {
  assert.deepEqual(riskMapParams({ dimensions: ['security'], area: 'api' }), { vizStyle: 'risk', dimensions: ['security'], area: 'api' });
});

test('riskMapParams narrows to a principle of one dimension', () => {
  assert.deepEqual(riskMapParams({ dimensions: ['security'], principle: 'Authenticity' }), { vizStyle: 'risk', dimensions: ['security'], principle: 'Authenticity' });
});
