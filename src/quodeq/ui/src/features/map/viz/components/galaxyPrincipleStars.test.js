import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGradeLookup, groupByPrinciple } from './galaxyPrincipleStars.js';

test('groupByPrinciple: principles named like Object.prototype members are plain keys', () => {
  const dim = {
    violations: [{ principle: 'constructor' }, { principle: '__proto__' }],
    compliance: [{ principle: 'toString' }],
  };
  const groups = groupByPrinciple(dim);
  assert.equal(groups.constructor.violations.length, 1);
  assert.equal(groups.__proto__.violations.length, 1);
  assert.equal(groups.toString.compliance.length, 1);
  assert.deepEqual(Object.keys(groups).sort(), ['__proto__', 'constructor', 'toString']);
});

test('groupByPrinciple / buildGradeLookup: an unknown principle misses instead of finding an inherited member', () => {
  assert.equal(groupByPrinciple({})['constructor'], undefined);
  assert.equal(buildGradeLookup({ principles: [] })['constructor'], undefined);
});
