import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskMapParams } from './riskLinks.js';

test('riskMapParams opens the Risk tab, filtered and with an area only when given', () => {
  assert.deepEqual(riskMapParams(), { vizStyle: 'risk' });
  assert.deepEqual(riskMapParams({ dimensions: ['security'], area: 'api' }), { vizStyle: 'risk', dimensions: ['security'], area: 'api' });
  assert.deepEqual(riskMapParams({ dimensions: ['security'], principle: 'Authenticity' }), { vizStyle: 'risk', dimensions: ['security'], principle: 'Authenticity' });
  assert.deepEqual(riskMapParams({ dimensions: [] }), { vizStyle: 'risk' });
});
