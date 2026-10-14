import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { navPrinciple, riskSelection, selectionKey, selectionOf } from './riskSelection.js';

const ALL = ['maintainability', 'reliability', 'security'];

describe('riskSelection', () => {
  it('is no selection while the filter keeps every dimension', () => {
    assert.equal(riskSelection({ allDimensions: ALL, selectedDimensions: new Set(ALL) }), null);
  });

  it('keeps the filtered dimensions in order', () => {
    const got = riskSelection({ allDimensions: ALL, selectedDimensions: new Set(['security', 'maintainability']) });
    assert.deepEqual(got, { dimensions: ['maintainability', 'security'], principle: '' });
  });

  it('narrows to the principle while only its dimension is kept', () => {
    const principle = { dimension: 'security', name: 'Authenticity' };
    assert.equal(riskSelection({ allDimensions: ALL, selectedDimensions: new Set(['security']), principle }).principle, 'Authenticity');
    assert.equal(riskSelection({ allDimensions: ALL, selectedDimensions: new Set(['reliability']), principle }).principle, '');
  });

  it('ignores a dimension the project does not have', () => {
    assert.deepEqual(riskSelection({ allDimensions: ALL, selectedDimensions: new Set(['ux', 'security']) }).dimensions, ['security']);
  });
});

describe('selectionKey', () => {
  it('is null for every finding and tells selections apart', () => {
    assert.equal(selectionKey(null), null);
    assert.notEqual(selectionKey(selectionOf(['security'])), selectionKey(selectionOf(['security'], 'Authenticity')));
    assert.equal(selectionKey(selectionOf(['b', 'a'])), selectionKey(selectionOf(['a', 'b'])));
  });
});

describe('navPrinciple', () => {
  it('needs exactly one dimension', () => {
    assert.deepEqual(navPrinciple({ dimensions: ['security'], principle: 'P' }), { dimension: 'security', name: 'P' });
    assert.equal(navPrinciple({ dimensions: ['security', 'reliability'], principle: 'P' }), null);
    assert.equal(navPrinciple({ principle: 'P' }), null);
  });
});
