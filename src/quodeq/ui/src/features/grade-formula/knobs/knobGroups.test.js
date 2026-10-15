import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, KNOB_GROUP, applyKnob, knobChanges } from './knobGroups.js';

const SAVED = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: true, dimensionWeights: {},
};
const knob = (groupId, knobId) => GROUPS.find((g) => g.id === groupId).knobs.find((k) => k.id === knobId);

test('the groups come in the page order, the four fine-tune groups folded', () => {
  assert.deepEqual(GROUPS.map((g) => g.id), ['cost', 'bands', 'steep', 'lift', 'ceil', 'floor']);
  assert.deepEqual(GROUPS.filter((g) => g.folded).map((g) => g.id), ['steep', 'lift', 'ceil', 'floor']);
});

test('applying a knob changes only its own value', () => {
  const next = applyKnob(SAVED, knob(KNOB_GROUP.COST, 'major'), 3);
  assert.equal(next.severityWeight.major, 3);
  assert.equal(next.severityWeight.critical, 4);
  assert.equal(SAVED.severityWeight.major, 2);
});

test('knobChanges lists every knob that moved, with its group', () => {
  const draft = applyKnob(applyKnob(SAVED, knob(KNOB_GROUP.COST, 'major'), 3), knob(KNOB_GROUP.STEEP, 'k'), 0.1);
  assert.deepEqual(knobChanges(draft, SAVED).map((c) => [c.group.id, c.knob.id, c.from, c.to]),
    [['cost', 'major', 2, 3], ['steep', 'k', 0.08, 0.1]]);
});

test('a moved grade boundary is a change of the bands group', () => {
  const draft = { ...SAVED, gradeThresholds: [[9.5, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']] };
  assert.deepEqual(knobChanges(draft, SAVED).map((c) => [c.group.id, c.knob.id, c.from, c.to]), [['bands', 'Exemplary', 9, 9.5]]);
});
