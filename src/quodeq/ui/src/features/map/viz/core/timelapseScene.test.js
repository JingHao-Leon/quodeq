import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTimelapse } from '../../model/mapTimelapse.js';
import { buildTimelapseModel } from './timelapseModel.js';
import { anchorLayout, runLayout } from './timelapseLayout.js';
import { XYR_STRIDE, PACK_BASE_SIZE } from './packLayout.js';
import {
  runNodeData, runPaint, absenceNote, absenceIn, lerpXyr, screenCoordsInto, transitionKind, focusIndexFor, runFocusTransform, cachedRuns, TRANSITION, ABSENCE,
} from './timelapseScene.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';
import { DEFAULT_SEVERITY_WEIGHTS } from './mapBadness.js';

const C = (r, g, b) => ({ r, g, b });
const PALETTE = {
  bg: C(10, 10, 10), surfaceAlt: C(20, 20, 20), text: C(230, 230, 230), border: C(60, 60, 60),
  worse: C(240, 80, 120), better: C(0, 212, 255), neutral: C(138, 143, 168),
  activity: C(0, 212, 255), activityIdle: C(138, 155, 176), glassParent: C(200, 195, 216),
};
const row = (file, violations, critical = 0) => [file, violations, violations, 2, critical, 0, 1, 0];
const PAYLOAD = {
  activitySource: 'git', fileNames: ['src/a.py', 'src/b.py', 'lib/c.py'], fileArea: ['x', 'x', 'y'], fileLayer: ['', '', ''],
  frameEncoding: 'delta',
  frames: [
    { day: '2026-09-01', new: 0, fixed: 0, areas: [], files: [row(0, 3, 1), row(2, 1)], gone: [] },
    { day: '2026-09-08', new: 1, fixed: 0, areas: [], files: [row(1, 2)], gone: [2] },
    { day: '2026-09-15', new: 0, fixed: 0, areas: [], files: [], gone: [] },
  ],
};
const DATA = decodeTimelapse(PAYLOAD);
const MODEL = buildTimelapseModel(DATA);
const at = (path) => MODEL.pathIndex.get(path);
const paintOf = (k) => runPaint({ model: MODEL, nodeData: runNodeData(MODEL, DATA, k), mode: PACK_COLOR_MODE.CONCENTRATION, palette: PALETTE, weights: DEFAULT_SEVERITY_WEIGHTS });

test('node data per run: files from their rows, folders summed, absent nodes kept and marked', () => {
  const zero = runNodeData(MODEL, DATA, 0);
  assert.deepEqual([zero[at('src/b.py')].absent, zero[at('src/b.py')].violations], [true, 0]);
  assert.deepEqual(zero[at('src/a.py')].severity, { critical: 1, major: 0, minor: 2 });
  assert.equal(zero[at('src')].violations, 3);
  assert.equal(runNodeData(MODEL, DATA, 1)[at('lib')].absent, true);
  assert.equal(runNodeData(MODEL, DATA, 1)[at('src')].violations, 5);
});

test('paint per run: present nodes painted as usual, absent ones as dotted ghosts', () => {
  const paint = paintOf(1);
  assert.equal(paint.length, MODEL.nodes.length);
  assert.equal(paint[at('lib/c.py')].ghost, true);
  assert.equal(paint[at('lib')].ghost, true);
  assert.notEqual(paint[at('src/b.py')].ghost, true);
});

test('an absent node says since when it is gone or when it first appears', () => {
  assert.deepEqual(absenceNote(MODEL, DATA.runs, 1, at('lib/c.py')), { kind: ABSENCE.GONE_SINCE, day: '2026-09-08' });
  assert.deepEqual(absenceNote(MODEL, DATA.runs, 0, at('src/b.py')), { kind: ABSENCE.FIRST_APPEARS, day: '2026-09-08' });
  assert.equal(absenceNote(MODEL, DATA.runs, 0, at('src')), null);
});

test('the absence rule reads presence through a callback, so other views can share it', () => {
  const runs = [{ day: 'd0' }, { day: 'd1' }, { day: 'd2' }, { day: 'd3' }];
  const presentIn = (set) => (j) => set.includes(j);
  assert.deepEqual(absenceIn(runs, 3, presentIn([0, 1])), { kind: ABSENCE.GONE_SINCE, day: 'd2' });
  assert.deepEqual(absenceIn(runs, 0, presentIn([2])), { kind: ABSENCE.FIRST_APPEARS, day: 'd2' });
  assert.equal(absenceIn(runs, 1, presentIn([1])), null);
  assert.equal(absenceIn(runs, 1, presentIn([])), null);
});

test('interpolation and screen coords write into reused arrays', () => {
  const out = new Float32Array(3);
  assert.deepEqual([...lerpXyr(Float32Array.from([0, 0, 1]), Float32Array.from([10, 20, 3]), 0.5, out)], [5, 10, 2]);
  const coords = [];
  assert.equal(screenCoordsInto(Float32Array.from([10, 20, 5]), { k: 2, tx: 1, ty: 0 }, coords), coords);
  assert.deepEqual(coords[0], { cx: 21, cy: 40, r: 10 });
});

test('big structural changes and far seeks cross-fade; small steps move', () => {
  const model = { parent: Int32Array.from([-1, 0, 0, 0, 0, 0]), sizes: [
    Float32Array.from([0, 1, 1, 1, 1, 1]), Float32Array.from([0, 1, 1, 1, 1, 1]), Float32Array.from([0, 1, 1, 1, 0, 0]),
  ], maxSize: Float32Array.from([0, 1, 1, 1, 1, 1]) };
  assert.equal(transitionKind(model, 0, 1), TRANSITION.MOVE);
  assert.equal(transitionKind(model, 1, 2), TRANSITION.FADE);
  assert.equal(transitionKind(model, 0, 2), TRANSITION.FADE);
  assert.equal(transitionKind(model, 1, 1), TRANSITION.NONE);
});

test('the camera frames the nearest folder of the path that exists in the history', () => {
  assert.equal(focusIndexFor(MODEL, 'src'), at('src'));
  assert.equal(focusIndexFor(MODEL, 'src/gone/deeper'), at('src'));
  assert.equal(focusIndexFor(MODEL, 'src/a.py'), at('src'));
  assert.equal(focusIndexFor(MODEL, 'nowhere/at/all'), 0);
  assert.equal(focusIndexFor(MODEL, ''), 0);
});

const CHAIN_DATA = decodeTimelapse({
  ...PAYLOAD, fileNames: ['a/b/c/x.py', 'a/b/c/y.py', 'a/bc/z.py'],
  frames: [{ day: '2026-09-01', files: [row(0, 1), row(1, 1), row(2, 1)], gone: [] }],
});
const CHAIN = buildTimelapseModel(CHAIN_DATA);

test('a dashboard folder inside a chain the history collapses frames that chain', () => {
  const chain = CHAIN.pathIndex.get('a/b/c');
  assert.equal(CHAIN.nodes[chain].data.name, 'b/c');
  assert.equal(focusIndexFor(CHAIN, 'a/b'), chain);
  assert.equal(focusIndexFor(CHAIN, 'a/b/c/gone'), chain);
  assert.equal(focusIndexFor(CHAIN, 'a/bc/gone'), CHAIN.pathIndex.get('a/bc'));
});

const circleAt = (xyr, i) => ({ x: xyr[i * XYR_STRIDE], y: xyr[i * XYR_STRIDE + 1], r: xyr[i * XYR_STRIDE + 2] });

test('a dashboard path missing from the history never leaves a blank map or a NaN camera', () => {
  for (const [model, path] of [[MODEL, 'src/gone/deeper'], [MODEL, 'nowhere/x.py'], [CHAIN, 'a/b'], [CHAIN, 'a']]) {
    const anchor = anchorLayout(model);
    const i = focusIndexFor(model, path);
    const { k, tx, ty } = runFocusTransform(anchor, runLayout(model, anchor, 0), i);
    assert.ok([k, tx, ty].every(Number.isFinite) && k > 0, `${path}: camera ${k} ${tx} ${ty}`);
    assert.ok(model.nodes[i].children?.length, `${path}: frames a folder with circles in it`);
  }
});

test('the camera centres a folder where the run draws it, at the zoom of its size today', () => {
  const anchor = anchorLayout(MODEL);
  const run = runLayout(MODEL, anchor, 0);
  const i = at('src');
  const inRun = circleAt(run, i);
  assert.notEqual(inRun.x, circleAt(anchor, i).x, 'run 0 draws src away from where it sits today');
  const { k, tx, ty } = runFocusTransform(anchor, run, i);
  assert.ok(Math.abs(inRun.x * k + tx - PACK_BASE_SIZE / 2) < 1e-3);
  assert.ok(Math.abs(inRun.y * k + ty - PACK_BASE_SIZE / 2) < 1e-3);
  assert.ok(Math.abs(k - PACK_BASE_SIZE / (2 * circleAt(anchor, i).r)) < 1e-6);
});

test('cachedRuns computes each run once and forgets the oldest', () => {
  let calls = 0;
  const get = cachedRuns((k) => { calls += 1; return k * 2; }, 2);
  assert.deepEqual([get(1), get(1), get(2), get(3), get(1)], [2, 2, 4, 6, 2]);
  assert.equal(calls, 4);
});
