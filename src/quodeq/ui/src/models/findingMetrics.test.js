import test from 'node:test';
import assert from 'node:assert/strict';

import { scopeMetrics, areaRisk, filesChecked, RISK_SMALL, runDimensionMetrics, tileChanges } from './findingMetrics.js';
import { RISK_ZONE } from '../vocab/riskZone.js';

const live = () => true;
const v = (file, over = {}) => ({ file, line: 1, ...over });
/** A scope's findings: violations by severity bucket, compliant checks. */
const scope = (bySeverity, compliance = []) => ({ violationsBySeverity: bySeverity, compliance });

test('scopeMetrics: a violation of unknown severity still counts, per 100 files and pass rate over it', () => {
  const m = scopeMetrics({ sevCounts: { critical: 1, major: 2, minor: 0 }, total: 4, compliance: 6, files: 20 });
  assert.equal(m.violations, 4);
  assert.equal(m.per100, 20);
  assert.equal(m.criticalPerK, 50);
  assert.equal(m.passPct, 60);
  assert.equal(m.risk, null);
});

test('scopeMetrics: never fewer violations than the known severities, and no base gives no ratio', () => {
  const m = scopeMetrics({ sevCounts: { major: 3 }, total: undefined, compliance: 0, files: 0 });
  assert.equal(m.violations, 3);
  assert.deepEqual([m.per100, m.criticalPerK], [null, null]);
  assert.equal(m.passPct, 0);
  assert.equal(scopeMetrics({ sevCounts: {}, total: 0, compliance: 0, files: 5 }).passPct, null);
});

test('scopeMetrics carries a folder\'s or area\'s Risk as handed', () => {
  const risk = { density: 1, zone: RISK_ZONE.FIX_FIRST };
  assert.equal(scopeMetrics({ sevCounts: {}, total: 0, compliance: 0, files: 1, risk }).risk, risk);
});

test('filesChecked: the distinct files of the violations and compliant checks', () => {
  assert.equal(filesChecked(scope({ major: [v('a.py'), v('a.py')], minor: [v('b.py')] }, [v('c.py'), v('a.py'), {}])), 3);
  assert.equal(filesChecked({}), 0);
});

test('areaRisk: weighted issues over production files only, on a mixed area', () => {
  const s = scope({ critical: [v('src/a.py')], major: [v('tests/test_a.py'), v('tests/test_b.py')] }, [v('src/b.py'), v('src/c.py')]);
  const risk = areaRisk(s, live);
  assert.equal(risk.density, 4 / 3);
  assert.equal(risk.zone, RISK_ZONE.FIX_FIRST);
});

test('areaRisk: an area of only tests is judged on its tests', () => {
  const s = scope({ minor: [v('tests/a.py'), v('tests/b.py')] }, [v('tests/c.py'), v('tests/d.py')]);
  const risk = areaRisk(s, live);
  assert.equal(risk.density, 0.5 / 4);
  assert.equal(risk.zone, RISK_ZONE.HEALTHY);
});

test('areaRisk: unknown severities weigh as minor, dismissed violations do not weigh', () => {
  const s = scope({ unknown: [v('a.py'), v('b.py')], major: [v('c.py', { line: 9 })] }, [v('d.py')]);
  const risk = areaRisk(s, (x) => x.line !== 9);
  assert.equal(risk.density, 0.5 / 3);
  assert.equal(risk.zone, RISK_ZONE.HEALTHY);
});

test('areaRisk: under three production files, or judged small by the Map, it is too small to judge', () => {
  const two = scope({ critical: [v('a.py'), v('b.py')] });
  assert.equal(areaRisk(two, live).zone, RISK_SMALL);
  assert.equal(areaRisk(two, live).density, 4);
  const three = scope({ major: [v('a.py')] }, [v('b.py'), v('c.py')]);
  assert.equal(areaRisk(three, live).zone, RISK_ZONE.WATCH);
  assert.equal(areaRisk(three, live, true).zone, RISK_SMALL);
});

test('runDimensionMetrics reads a run\'s dimension as scopeMetrics reads a scope', () => {
  const m = runDimensionMetrics({ totals: { severity: { critical: 1, major: 1 }, violationCount: 2, complianceCount: 8 }, filesRead: 40 });
  assert.equal(m.per100, 5);
  assert.equal(m.criticalPerK, 25);
  assert.equal(m.passPct, 80);
  assert.equal(runDimensionMetrics({ filesRead: 3 }), null);
  assert.equal(runDimensionMetrics(null), null);
});

test('tileChanges: the pass rate from a whole point, the rates from a twentieth', () => {
  const now = { passPct: 80, per100: 5, criticalPerK: 25 };
  assert.deepEqual(tileChanges(now, { passPct: 90, per100: 2.5, criticalPerK: 25 }), { passPct: -10, per100: 2.5, criticalPerK: null });
  assert.deepEqual(tileChanges(now, { passPct: 79.5, per100: 4.96, criticalPerK: 25.5 }), { passPct: null, per100: null, criticalPerK: -0.5 });
  assert.equal(tileChanges(now, { passPct: 79, per100: 5.05, criticalPerK: 25 }).passPct, 1);
});

test('tileChanges: nothing without a previous period, or where either side has no number', () => {
  const none = { passPct: null, per100: null, criticalPerK: null };
  assert.deepEqual(tileChanges({ passPct: 80, per100: 5, criticalPerK: 25 }, null), none);
  assert.deepEqual(tileChanges({ passPct: null, per100: null, criticalPerK: null }, { passPct: 70, per100: 1, criticalPerK: 2 }), none);
});
