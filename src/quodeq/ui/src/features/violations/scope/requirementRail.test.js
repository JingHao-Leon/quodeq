import test from 'node:test';
import assert from 'node:assert/strict';
import { requirementRail, requirementCounts, rowsOfRequirement, reqKindCounts } from './requirementRail.js';

const v = (req, severity, file = 'a.py', line = 1) => ({ req, severity, file, line, title: `${req} title` });
const FILE = {
  violationsBySeverity: { critical: [v('R2', 'critical', 'b.py', 4)], major: [v('R1', 'major'), v('R1', 'major', 'a.py', 9)], minor: [v('R1', 'minor', 'c.py', 2)] },
  compliance: [{ req: 'R3', title: 'Holds' }, { req: 'R3', title: 'Holds' }, { req: 'R1', title: 'Also' }, { req: null, title: 'No req' }],
};
const live = () => true;

test('requirementRail: failing worst first, then the ones that only pass, counted', () => {
  const rail = requirementRail('security', FILE, live);
  assert.deepEqual(rail.failing.map((r) => r.req), ['R2', 'R1']);
  assert.deepEqual(rail.passing, [{ req: 'R3', text: 'Holds', count: 2 }]);
});

test('requirementRail: a requirement whose violations are all dismissed only passes', () => {
  const rail = requirementRail('security', FILE, (x) => x.req !== 'R2');
  assert.deepEqual(rail.failing.map((r) => r.req), ['R1']);
});

test('requirementCounts: failing of checked', () => {
  assert.deepEqual(requirementCounts(FILE), { failing: 2, total: 3 });
});

test('rowsOfRequirement keeps a header only above its findings, recounted', () => {
  const rows = [
    { kind: 'sev-header', sev: 'critical', count: 1 }, { kind: 'violation', v: FILE.violationsBySeverity.critical[0] },
    { kind: 'sev-header', sev: 'major', count: 2 }, { kind: 'violation', v: v('R1', 'major') }, { kind: 'violation', v: v('R2', 'major') },
    { kind: 'compliance-header', count: 1 }, { kind: 'compliance', c: { req: 'R3' } },
  ];
  assert.deepEqual(rowsOfRequirement(rows, 'R1').map((r) => [r.kind, r.count ?? r.v?.req]), [['sev-header', 1], ['violation', 'R1']]);
  assert.equal(rowsOfRequirement(rows, null), rows);
});

test('reqKindCounts: the live violations by severity and the compliant checks of one requirement', () => {
  assert.deepEqual(reqKindCounts(FILE, 'R1', live), { sev: { critical: 0, major: 2, minor: 1 }, compliance: 1 });
  assert.deepEqual(reqKindCounts(FILE, 'R1', (x) => x.line !== 9), { sev: { critical: 0, major: 1, minor: 1 }, compliance: 1 });
});
