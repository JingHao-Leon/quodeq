import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTimelapse, NO_TIMELAPSE } from './mapTimelapse.js';

const NAMES = ['a.py', 'b.py', 'c.py'];
const row = (file, violations, compliance = 1, edits = 0) => [file, violations, violations, compliance, 0, 0, edits, 0];
const FULL_FRAMES = [
  { day: '2026-09-01', new: 0, fixed: 0, areas: [], files: [row(0, 2), row(1, 1)] },
  { day: '2026-09-08', new: 1, fixed: 1, areas: [], files: [row(0, 2), row(2, 3)] },
  { day: '2026-09-15', new: 0, fixed: 2, areas: [{ area: 'x' }], files: [row(0, 0, 4, 1), row(2, 3)] },
];
const DELTA_FRAMES = [
  { ...FULL_FRAMES[0], gone: [] },
  { ...FULL_FRAMES[1], files: [row(2, 3)], gone: [1] },
  { ...FULL_FRAMES[2], files: [row(0, 0, 4, 1)], gone: [] },
];
const payload = (frames, frameEncoding) => ({ activitySource: 'git', fileNames: NAMES, fileArea: ['x', 'x', 'x'], fileLayer: ['', '', ''], frameEncoding, frames });

test('delta frames decode to the same runs as full frames', () => {
  const full = decodeTimelapse(payload(FULL_FRAMES, 'full'));
  const delta = decodeTimelapse(payload(DELTA_FRAMES, 'delta'));
  assert.deepEqual(delta.runs, full.runs);
  assert.deepEqual(delta.checks.map((c) => [...c]), full.checks.map((c) => [...c]));
  for (const k of [2, 0, 1, 2]) assert.deepEqual([...delta.rowsAt(k)], [...full.rowsAt(k)]);
});

test('a run lists its day, flows, issue total and areas', () => {
  const { runs } = decodeTimelapse(payload(DELTA_FRAMES, 'delta'));
  assert.deepEqual(runs.map((r) => [r.day, r.added, r.fixed, r.issues]), [['2026-09-01', 0, 0, 3], ['2026-09-08', 1, 1, 5], ['2026-09-15', 0, 2, 3]]);
  assert.deepEqual(runs[2].areas, [{ area: 'x' }]);
});

test('checks per file: violations plus compliance, at least 1, 0 when absent', () => {
  const { checks } = decodeTimelapse(payload(DELTA_FRAMES, 'delta'));
  assert.deepEqual([...checks[1]], [3, 0, 4]);
  assert.deepEqual([...checks[2]], [4, 0, 4]);
});

test('a payload without frames decodes to nothing', () => {
  assert.equal(decodeTimelapse(null), NO_TIMELAPSE);
  assert.equal(decodeTimelapse({ fileNames: [], frames: [] }), NO_TIMELAPSE);
});
