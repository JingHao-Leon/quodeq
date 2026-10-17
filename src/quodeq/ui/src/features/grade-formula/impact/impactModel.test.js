import test from 'node:test';
import assert from 'node:assert/strict';
import { projectImpact, principleShifts, gradeDistribution, groupReach, allPrinciples } from './impactModel.js';
import { GROUPS } from '../knobs/knobGroups.js';
import { principleScore } from '../scoring/livePreview.js';

const SAVED = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};
const P = (id, major) => ({ id, massMinor: 1, massMajor: major, massCritical: 0, complianceMass: 4, observation: 2, worst: 'major' });
const INPUTS = { projects: [
  { id: 'a', dimensions: [{ dimension: 'security', frozenScore: null, principles: [P('p1', 0.5), P('p2', 4)] }] },
  { id: 'b', dimensions: [{ dimension: 'usability', frozenScore: 8.1, principles: [] }] },
] };
const STRICT = { ...SAVED, severityWeight: { critical: 4, major: 3.5, minor: 0.25 } };

test('each project gets its name, before and after', () => {
  const rows = projectImpact(INPUTS, { a: 'Alpha' }, SAVED, STRICT);
  assert.deepEqual(rows.map((r) => [r.id, r.name]), [['a', 'Alpha'], ['b', 'b']]);
  assert.ok(rows[0].after.overall < rows[0].before.overall);
  assert.equal(rows[1].after.overall, 8.1);
});

test('a frozen dimension never moves', () => {
  const [, b] = projectImpact(INPUTS, {}, SAVED, STRICT);
  assert.equal(b.before.overall, b.after.overall);
  assert.equal(b.flips, false);
});

test('principle shifts count score moves and grade crossings', () => {
  const moved = allPrinciples(INPUTS).filter(({ p }) => principleScore(p, SAVED) !== principleScore(p, STRICT)).length;
  const shifts = principleShifts(INPUTS, SAVED, STRICT);
  assert.equal(shifts.moved, moved);
  assert.equal(shifts.up, 0);
});

test('the distribution counts every principle once', () => {
  const dist = gradeDistribution(INPUTS, SAVED);
  assert.equal(Object.values(dist).reduce((a, b) => a + b, 0), 2);
});

test('a group reaches only the principles its own knobs move', () => {
  const cost = GROUPS.find((g) => g.id === 'cost');
  const lift = GROUPS.find((g) => g.id === 'lift');
  assert.ok(groupReach(cost, INPUTS, SAVED, STRICT) > 0);
  assert.equal(groupReach(lift, INPUTS, SAVED, STRICT), 0);
});

test('allPrinciples walks one inputs object once and hands back the same list', () => {
  assert.equal(allPrinciples(INPUTS), allPrinciples(INPUTS));
  assert.notEqual(allPrinciples(INPUTS), allPrinciples({ projects: [...INPUTS.projects] }));
});
