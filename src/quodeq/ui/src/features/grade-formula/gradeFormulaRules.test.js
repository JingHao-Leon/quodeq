import test from 'node:test';
import assert from 'node:assert/strict';
import { clampFloors, clampSeverity } from './gradeFormulaRules.js';

const DRAFT = { floorMinor: 8, floorMajor: 5, baseK: 0.1 };

test('clampFloors: floorMinor cannot drop below floorMajor', () => {
  assert.deepEqual(clampFloors(DRAFT, { floorMinor: 3 }), { floorMinor: 5 });
});

test('clampFloors: floorMinor passes through unchanged when already above floorMajor', () => {
  assert.deepEqual(clampFloors(DRAFT, { floorMinor: 9 }), { floorMinor: 9 });
});

test('clampFloors: floorMajor cannot rise above floorMinor', () => {
  assert.deepEqual(clampFloors(DRAFT, { floorMajor: 10 }), { floorMajor: 8 });
});

test('clampFloors: floorMajor passes through unchanged when already below floorMinor', () => {
  assert.deepEqual(clampFloors(DRAFT, { floorMajor: 2 }), { floorMajor: 2 });
});

test('clampFloors: is a no-op on a patch that touches neither floor', () => {
  const patch = { gradeThresholds: [[9, 'Exemplary']] };
  assert.equal(clampFloors(DRAFT, patch), patch);
});

test('clampFloors: is a no-op on a patch that touches an unrelated field', () => {
  const patch = { baseK: 0.5 };
  assert.equal(clampFloors(DRAFT, patch), patch);
});

test('clampFloors: passes the patch through when draft is not yet loaded', () => {
  const patch = { floorMinor: 3 };
  assert.equal(clampFloors(null, patch), patch);
});

const SEV = { critical: 4, major: 2, minor: 0.25 };
const SEV_DRAFT = { severityWeight: SEV };
const sev = (over) => ({ severityWeight: { ...SEV, ...over } });

test('clampSeverity: minor stays below major', () => {
  assert.equal(clampSeverity(SEV_DRAFT, sev({ minor: 3 })).severityWeight.minor, 1.95);
});

test('clampSeverity: major stays between minor and critical', () => {
  assert.equal(clampSeverity(SEV_DRAFT, sev({ major: 6 })).severityWeight.major, 3.95);
  assert.equal(clampSeverity(SEV_DRAFT, sev({ major: 0.1 })).severityWeight.major, 0.3);
});

test('clampSeverity: critical stays above major', () => {
  assert.equal(clampSeverity(SEV_DRAFT, sev({ critical: 1 })).severityWeight.critical, 2.05);
});

test('clampSeverity: leaves patches without severityWeight alone', () => {
  const patch = { baseK: 0.1 };
  assert.equal(clampSeverity(SEV_DRAFT, patch), patch);
});

test('clampFloors: a patch carrying both floors clamps against its own values', () => {
  assert.deepEqual(clampFloors({ floorMinor: 8, floorMajor: 7 }, { floorMinor: 5, floorMajor: 3 }), { floorMinor: 5, floorMajor: 3 });
});
