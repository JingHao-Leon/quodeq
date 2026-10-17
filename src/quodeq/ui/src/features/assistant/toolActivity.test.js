import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeToolCall, groupStatus, groupToolMessages, settleRunningTools, withToolFrame,
} from './toolActivity.js';

const start = { type: 'tool_call', callId: 'c1', name: 'get_violations', kind: 'quodeq', status: 'running',
  args: { dimension: 'maintainability', path: 'feature-article' } };
const end = { type: 'tool_call', callId: 'c1', name: 'get_violations', kind: 'quodeq', status: 'ok', durationMs: 412 };

test('withToolFrame appends a running line and settles it in place on the end frame', () => {
  const afterStart = withToolFrame([], start);
  assert.equal(afterStart.length, 1);
  assert.equal(afterStart[0].status, 'running');
  const afterEnd = withToolFrame(afterStart, end);
  assert.equal(afterEnd.length, 1);
  assert.equal(afterEnd[0].status, 'ok');
  assert.equal(afterEnd[0].durationMs, 412);
  assert.deepEqual(afterEnd[0].args, start.args);
});

test('withToolFrame treats a frame without status as a finished line of its own', () => {
  const out = withToolFrame([], { type: 'tool_call', name: 'get_scores', argsSummary: '{}' });
  assert.equal(out[0].status, 'ok');
  assert.equal(out[0].kind, 'quodeq');
  // An end frame nobody started still shows, finished.
  const orphan = withToolFrame([], end);
  assert.equal(orphan.length, 1);
  assert.equal(orphan[0].status, 'ok');
});

test('settleRunningTools closes stragglers with the turn outcome and leaves settled lines alone', () => {
  const prev = [withToolFrame([], start)[0], { role: 'tool', callId: 'c2', name: 'get_scores', status: 'ok' }];
  const done = settleRunningTools(prev, 'ok');
  assert.deepEqual(done.map((m) => m.status), ['ok', 'ok']);
  assert.equal(settleRunningTools(done, 'error'), done, 'nothing running: same array back');
});

test('groupToolMessages folds consecutive tool lines and keeps the rest in order', () => {
  const messages = [
    { role: 'user', text: 'why?' }, { role: 'tool', name: 'a', status: 'ok' }, { role: 'tool', name: 'b', status: 'ok' },
    { role: 'assistant', text: 'Still checking.' }, { role: 'tool', name: 'c', status: 'running' },
  ];
  const grouped = groupToolMessages(messages);
  assert.equal(grouped.length, 4);
  assert.deepEqual(grouped[1].items.map((m) => m.name), ['a', 'b']);
  assert.equal(grouped[2].text, 'Still checking.');
  assert.equal(groupStatus(grouped[3].items), 'running');
  assert.equal(groupStatus(grouped[1].items), 'ok');
  assert.equal(groupStatus([{ status: 'ok' }, { status: 'error' }]), 'error');
});

test('describeToolCall reads the quodeq tools as verb phrases', () => {
  assert.equal(describeToolCall(withToolFrame([], start)[0]).label, 'Reading maintainability violations in feature-article');
  assert.equal(describeToolCall({ name: 'get_violations', args: {} }).label, 'Reading violations');
  assert.equal(describeToolCall({ name: 'search_findings', args: { query: 'M-MOD-4' } }).label,
    'Searching findings for “M-MOD-4”');
  assert.equal(describeToolCall({ name: 'compare_runs', args: { run_id: '1810f49b-aaaa', against: 'f5941671-bbbb' } }).label,
    'Comparing run 1810f49b with f5941671');
  assert.equal(describeToolCall({ name: 'compare_runs', args: { run_id: '1810f49b-aaaa' } }).label,
    'Comparing run 1810f49b with the run before');
  assert.equal(describeToolCall({ name: 'compare_projects', args: { projects: ['a', 'b'] } }).label, 'Comparing 2 projects');
  assert.equal(describeToolCall({ name: 'ToolSearch', kind: 'harness', args: { query: 'x' } }).label, 'Preparing tools');
});

test('describeToolCall falls back to the raw name with the arguments as detail', () => {
  const out = describeToolCall({ name: 'shell', args: { command: 'ls' } });
  assert.equal(out.label, 'Running shell');
  assert.equal(out.detail, '{"command":"ls"}');
  assert.equal(describeToolCall({ name: 'weird', argsSummary: '{"a": 1}' }).detail, '{"a": 1}');
});
