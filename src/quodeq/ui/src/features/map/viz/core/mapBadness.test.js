// src/quodeq/ui/src/features/map/viz/core/mapBadness.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badness, nodeWeight, DEFAULT_SEVERITY_WEIGHTS } from './mapBadness.js';
import { NODE_KIND } from '../../mapVocab.js';

const AVERAGE = 1;
const EPS = 1e-9;
const FULL_LIFT = 2 ** 1.6;    // log2(lift) / 1.6 = 1
const HALF_LIFT = 0.5;
const close = (a, b) => Math.abs(a - b) < 1e-6;

// One file-sized unit with a given lift and pass rate.
function stats({ lift = 1, violations = 4, compliance = 0, critical = 0, major = 0, files = 1 }) {
  return { violations, compliance, weight: lift * AVERAGE * files, files, critical, major };
}

test('no findings is neutral and clean is fully better', () => {
  assert.equal(badness(stats({ violations: 0 }), AVERAGE, NODE_KIND.FOLDER), 0);
  assert.equal(badness(stats({ violations: 0, compliance: 3 }), AVERAGE, NODE_KIND.FOLDER), -1);
});

test('the worst finding caps the colour', () => {
  assert.ok(close(badness(stats({ lift: FULL_LIFT, critical: 1 }), AVERAGE, NODE_KIND.FOLDER), 1));
  assert.ok(close(badness(stats({ lift: FULL_LIFT, major: 1 }), AVERAGE, NODE_KIND.FOLDER), 0.8));
  assert.ok(close(badness(stats({ lift: FULL_LIFT }), AVERAGE, NODE_KIND.FOLDER), 0.5));
});

test('a poor pass rate adds absolute red, but a parent only gets a tint', () => {
  const poor = stats({ violations: 3, compliance: 1, major: 1 });   // rate 0.25, lift 1
  assert.ok(close(badness(poor, AVERAGE, NODE_KIND.FOLDER), 0.7));
  assert.ok(close(badness(poor, AVERAGE, NODE_KIND.PARENT), 0.25));
});

test('a high pass rate pulls toward better, with floors for files and parents', () => {
  const good = stats({ violations: 1, compliance: 19 });            // rate 0.95, lift 1
  assert.ok(close(badness(good, AVERAGE, NODE_KIND.FOLDER), -0.85));
  assert.ok(close(badness(good, AVERAGE, NODE_KIND.FILE), -0.6));
  assert.ok(close(badness(good, AVERAGE, NODE_KIND.PARENT), -0.2));
});

test('a critical blocks the good pull', () => {
  const s = stats({ lift: HALF_LIFT, violations: 1, compliance: 19, critical: 1 });
  assert.ok(close(badness(s, AVERAGE, NODE_KIND.FOLDER), 0.15));
});

test('weights follow the grade formula', () => {
  const node = { severity: { critical: 1, major: 2, minor: 4 } };
  assert.ok(Math.abs(nodeWeight(node, DEFAULT_SEVERITY_WEIGHTS) - 9) < EPS);
  assert.ok(Math.abs(nodeWeight(node, { critical: 1, major: 1, minor: 1 }) - 7) < EPS);
});

test('a node without a severity object weighs nothing', () => {
  assert.equal(nodeWeight({}, DEFAULT_SEVERITY_WEIGHTS), 0);
});

test('a zero project average still gives a finite badness', () => {
  const b = badness(stats({ lift: 1 }), 0, NODE_KIND.FOLDER);
  assert.ok(Number.isFinite(b));
  assert.ok(b >= -1 && b <= 1);
});
