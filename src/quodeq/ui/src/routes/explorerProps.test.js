import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownProjectProps } from './explorerProps.js';

const props = {
  navigation: { selectedProject: 'p1', selectedSource: 'local' },
  dashboardData: { dashboard: { trend: [{ runId: 'r1' }] }, latestAccumulated: { dimensions: [{ dimension: 'security', fromRunId: 'r1', filesRead: 158 }] } },
};

test('an explorer of the selected project borrows its trend, today\'s run of the dimension and the files it read', () => {
  assert.deepEqual(ownProjectProps({ dimension: 'security' }, props), { trend: [{ runId: 'r1' }], scopedFindings: { latestRunId: 'r1' }, filesRead: 158 });
});

test('a cross-project explorer borrows neither, and keeps the File page', () => {
  const none = { trend: null, scopedFindings: null, filesRead: null };
  assert.deepEqual(ownProjectProps({ dimension: 'security', fromProject: 'other' }, props), none);
  assert.deepEqual(ownProjectProps({ dimension: 'security', fromSource: 'shared' }, props), none);
});
