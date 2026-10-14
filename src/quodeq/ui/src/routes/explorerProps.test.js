import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownProjectProps } from './explorerProps.js';

const props = {
  navigation: { selectedProject: 'p1', selectedSource: 'local' },
  dashboardData: { dashboard: { trend: [{ runId: 'r1' }] }, latestAccumulated: { dimensions: [{ dimension: 'security', fromRunId: 'r1' }] } },
};

test('an explorer of the selected project borrows its trend and today\'s run of the dimension', () => {
  assert.deepEqual(ownProjectProps({ dimension: 'security' }, props), { trend: [{ runId: 'r1' }], scopedFindings: { latestRunId: 'r1' } });
});

test('a cross-project explorer borrows neither, and keeps the File page', () => {
  assert.deepEqual(ownProjectProps({ dimension: 'security', fromProject: 'other' }, props), { trend: null, scopedFindings: null });
  assert.deepEqual(ownProjectProps({ dimension: 'security', fromSource: 'shared' }, props), { trend: null, scopedFindings: null });
});
