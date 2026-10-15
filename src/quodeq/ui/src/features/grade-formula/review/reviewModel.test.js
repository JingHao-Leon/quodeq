import test from 'node:test';
import assert from 'node:assert/strict';
import { effectKey, serverFlips } from './reviewModel.js';

test('a change names its group and direction', () => {
  assert.equal(effectKey({ group: { id: 'cost' }, from: 2, to: 3 }), 'gradeFormula.effectCostUp');
  assert.equal(effectKey({ group: { id: 'bands' }, from: 9, to: 8.5 }), 'gradeFormula.effectBandsDown');
});

test('server flips are the projects whose grade changes, named', () => {
  const payload = { projects: [
    { id: 'a', before: { overall: { score: 7.3, grade: 'Good' } }, after: { overall: { score: 6.5, grade: 'Adequate' } } },
    { id: 'b', before: { overall: { score: 9.1, grade: 'Exemplary' } }, after: { overall: { score: 9.0, grade: 'Exemplary' } } },
  ], runsToRescore: 12 };
  assert.deepEqual(serverFlips(payload, { a: 'Alpha' }), [{ id: 'a', name: 'Alpha', from: 'Good', to: 'Adequate', before: 7.3, after: 6.5 }]);
});

test('a dimension weight and the weights switch say what they do', () => {
  const group = { id: 'dimensions' };
  assert.equal(effectKey({ group, knob: { label: 'security' }, from: 1, to: 1.5 }), 'gradeFormula.effectDimensionsUp');
  assert.equal(effectKey({ group, knob: { label: 'security' }, from: 1, to: 0.5 }), 'gradeFormula.effectDimensionsDown');
  assert.equal(effectKey({ group, knob: { toggle: true }, from: false, to: true }), 'gradeFormula.effectWeightsOn');
  assert.equal(effectKey({ group, knob: { toggle: true }, from: true, to: false }), 'gradeFormula.effectWeightsOff');
});
