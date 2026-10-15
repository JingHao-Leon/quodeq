import test from 'node:test';
import assert from 'node:assert/strict';
import { chartScale, principleDots } from './chartScale.js';

const SAVED = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 0.08, liftCompress: 2.2, ceilScale: 0.5,
  floorMinor: 5, floorMajor: 3, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};
const INPUTS = { projects: [{ id: 'a', dimensions: [{ dimension: 'security', frozenScore: null, principles: [
  { id: 'p', massMinor: 1, massMajor: 2, massCritical: 0, complianceMass: 3, observation: 1, worst: 'major' }] }] }] };

test('the scale spans 0 to 10 upward and keeps the log x inside the plot', () => {
  const s = chartScale(10);
  assert.equal(s.y(10), s.plot.top);
  assert.equal(s.y(0), s.plot.bottom);
  assert.equal(s.x(0), s.plot.left);
  assert.ok(s.x(48) <= s.plot.right);
});

test('a dot keeps its column when severity weights change and moves only up or down', () => {
  const heavier = { ...SAVED, severityWeight: { critical: 4, major: 3.5, minor: 0.25 } };
  const [rest] = principleDots(INPUTS, SAVED, SAVED);
  const [moved] = principleDots(INPUTS, SAVED, heavier);
  assert.equal(moved.x, rest.x);
  assert.equal(moved.dir, 'down');
  assert.ok(moved.yAfter > moved.yBefore);
});
