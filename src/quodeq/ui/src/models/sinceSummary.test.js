import test from 'node:test';
import assert from 'node:assert/strict';

import { sinceSummary, previousPeriodRunId, topMovers } from './sinceSummary.js';

const finding = (principle) => ({ principle, file: 'a.py' });
const dim = ({ added = 0, fixed = 0, newList = [], resolved = [], opened = [], closed = [] } = {}) => ({
  counts: { new: added, resolved: fixed }, new: newList, resolved, types: { opened, closed },
});
const everyDimension = () => true;

test('sinceSummary adds the kept dimensions\' new and fixed findings and their rule types', () => {
  const payloads = [{ dimensions: { security: dim({ added: 3, fixed: 1, opened: ['S-1'] }), reliability: dim({ added: 2, closed: ['R-1', 'R-2'] }) } }];
  assert.deepEqual(sinceSummary(payloads, everyDimension), { newCount: 5, resolvedCount: 1, typesOpened: 1, typesClosed: 2 });
});

test('sinceSummary counts a dimension only from the comparisons `keep` picks', () => {
  const payloads = [{ dimensions: { security: dim({ added: 3 }) } }, { dimensions: { security: dim({ added: 7 }) } }];
  assert.equal(sinceSummary(payloads, (name, i) => i === 1).newCount, 7);
});

test('sinceSummary narrowed to a principle counts its listed findings, any case, and no rule types', () => {
  const security = dim({ added: 3, newList: [finding('Authenticity'), finding('integrity')], resolved: [finding('AUTHENTICITY')], opened: ['S-1'] });
  assert.deepEqual(sinceSummary([{ dimensions: { security } }], everyDimension, 'authenticity'),
    { newCount: 1, resolvedCount: 1, typesOpened: 0, typesClosed: 0 });
});

test('sinceSummary with nothing changed is a zero summary, not null', () => {
  assert.deepEqual(sinceSummary([{ dimensions: { security: dim() } }], everyDimension), { newCount: 0, resolvedCount: 0, typesOpened: 0, typesClosed: 0 });
});

test('sinceSummary is null when nothing was compared', () => {
  assert.equal(sinceSummary([undefined], everyDimension), null);
  assert.equal(sinceSummary([{ dimensions: { security: dim({ added: 1 }) } }], () => false), null);
});

test('previousPeriodRunId is the row after the one on show, the newest row\'s when none is', () => {
  const rows = [{ runId: 'r3' }, { runId: 'r2' }, { runId: 'r1' }];
  assert.equal(previousPeriodRunId(rows, null), 'r2');
  assert.equal(previousPeriodRunId(rows, 'r2'), 'r1');
  assert.equal(previousPeriodRunId(rows, 'r1'), null);
  assert.equal(previousPeriodRunId(rows, 'gone'), null);
  assert.equal(previousPeriodRunId(undefined, null), null);
});

test('topMovers keeps the three largest changes that show, largest first', () => {
  const trends = { a: { delta: 0.2 }, b: { delta: -1.4 }, c: { delta: 0.01 }, d: { delta: 0.6 }, e: { delta: -0.3 }, f: { delta: null } };
  assert.deepEqual(topMovers(trends).map((m) => m.name), ['b', 'd', 'e']);
});
