import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseDiff } from './runDiff.js';

test('summariseDiff folds dimensions, majors first', () => {
  const s = summariseDiff({ dimensions: {
    security: { counts: { new: 2, resolved: 1, notReevaluated: 3 }, new: [{ severity: 'minor', file: 'b' }, { severity: 'major', file: 'a' }], resolved: [{ severity: 'minor', file: 'c' }] },
  } });
  assert.deepEqual(s.new.map((f) => f.severity), ['major', 'minor']);
  assert.equal(s.unchecked, 3);
  assert.deepEqual(s.perDim.security, { new: 2, resolved: 1, unchecked: 3, newSev: {}, resolvedSev: {} });
  assert.deepEqual(s.newSev, { major: 1, minor: 1 });
});

test('summariseDiff keeps each dimension\'s new and fixed severities', () => {
  const s = summariseDiff({ dimensions: {
    security: { counts: { new: 3, resolved: 1, newSev: { critical: 1, major: 2 }, resolvedSev: { major: 1 } } },
    usability: { counts: { new: 0, resolved: 0 } },
  } });
  assert.deepEqual(s.perDim.security.newSev, { critical: 1, major: 2 });
  assert.deepEqual(s.perDim.security.resolvedSev, { major: 1 });
  assert.deepEqual(s.perDim.usability.newSev, {});
});

test('summariseDiff is null without a payload', () => {
  assert.equal(summariseDiff(null), null);
  assert.equal(summariseDiff({}), null);
});
