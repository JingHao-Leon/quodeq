import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEVERITY_WEIGHTS, FIX_FIRST_DENSITY, WATCH_DENSITY, MIN_PROD_FILES,
  zoneOf, isTestPath, severityWeight, judgedFiles,
} from './riskRules.js';
import { RISK_ZONE } from '../vocab/riskZone.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../features/map/viz/core/mapBadness.js';
import { zoneOf as skyZoneOf, FIX_FIRST_DENSITY as SKY_FIX_FIRST } from '../features/map/viz/core/skyScale.js';
import { SKY_ZONE } from '../features/map/mapVocab.js';

const EPS = 1e-9;

test('the Risk measure mirrors area_metrics.py: the formula weights, zones at 0.75 and 0.5, three production files', () => {
  assert.deepEqual(SEVERITY_WEIGHTS, { critical: 7.5, major: 2, minor: 0.15 });
  assert.deepEqual([FIX_FIRST_DENSITY, WATCH_DENSITY, MIN_PROD_FILES], [0.75, 0.5, 3]);
  assert.equal(Object.isFrozen(SEVERITY_WEIGHTS), true);
});

test('the Map reads the same measure, not a copy of it', () => {
  assert.equal(DEFAULT_SEVERITY_WEIGHTS, SEVERITY_WEIGHTS);
  assert.equal(skyZoneOf, zoneOf);
  assert.equal(SKY_FIX_FIRST, FIX_FIRST_DENSITY);
  assert.equal(SKY_ZONE, RISK_ZONE);
});

test('zoneOf: fix first from 0.75, watch from 0.5, healthy below', () => {
  assert.equal(zoneOf(FIX_FIRST_DENSITY), RISK_ZONE.FIX_FIRST);
  assert.equal(zoneOf(FIX_FIRST_DENSITY - EPS), RISK_ZONE.WATCH);
  assert.equal(zoneOf(WATCH_DENSITY), RISK_ZONE.WATCH);
  assert.equal(zoneOf(WATCH_DENSITY - EPS), RISK_ZONE.HEALTHY);
  assert.equal(zoneOf(0), RISK_ZONE.HEALTHY);
});

test('isTestPath tells a test file as the Map\'s areas do (areas.py _TEST_SEGMENT)', () => {
  for (const p of ['tests/a.py', 'src/test/A.java', 'app/src/androidTest/X.kt', 'web/__tests__/a.js', 'spec/a_spec.rb', 'unittests/a.c']) {
    assert.equal(isTestPath(p), true, p);
  }
  for (const p of ['src/app.py', 'src/attestation.py', 'src/testing.py', '', undefined]) assert.equal(isTestPath(p), false, String(p));
});

test('severityWeight: a severity the formula does not know weighs as a minor one', () => {
  assert.deepEqual(['critical', 'major', 'minor'].map(severityWeight), [7.5, 2, 0.15]);
  assert.equal(severityWeight('unknown'), 0.15);
  assert.equal(severityWeight(undefined), 0.15);
  assert.equal(severityWeight('toString'), 0.15);
});

test('judgedFiles: the production files, or every file when there are only tests', () => {
  assert.deepEqual([...judgedFiles(['src/a.py', 'tests/test_a.py', 'src/b.py'])], ['src/a.py', 'src/b.py']);
  assert.deepEqual([...judgedFiles(new Set(['tests/a.py', 'tests/b.py']))], ['tests/a.py', 'tests/b.py']);
  assert.equal(judgedFiles([]).size, 0);
});
