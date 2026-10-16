import { describe, expect, it } from 'vitest';
import { buildGradeLookup, groupByPrinciple } from './galaxyPrincipleStars.js';

describe('groupByPrinciple', () => {
  it('groups principles named like Object.prototype members as plain keys', () => {
    const dim = {
      violations: [{ principle: 'constructor' }, { principle: '__proto__' }],
      compliance: [{ principle: 'toString' }],
    };
    const groups = groupByPrinciple(dim);
    expect(groups.constructor.violations).toHaveLength(1);
    expect(groups.__proto__.violations).toHaveLength(1);
    expect(groups.toString.compliance).toHaveLength(1);
    expect(Object.keys(groups).sort()).toEqual(['__proto__', 'constructor', 'toString']);
  });

  it('a lookup for an unknown principle misses instead of finding an inherited member', () => {
    expect(groupByPrinciple({})['constructor']).toBeUndefined();
    expect(buildGradeLookup({ principles: [] })['constructor']).toBeUndefined();
  });
});
