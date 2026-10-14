import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTimelapse } from '../../model/mapTimelapse.js';
import { buildTimelapseModel } from './timelapseModel.js';
import { runLayout } from './timelapseLayout.js';
import { XYR_STRIDE, PACK_BASE_SIZE } from './packLayout.js';
import {
  runNodeData, runPaint, lerpXyr, screenCoordsInto, transitionKind, focusIndexFor, runFocusTransform, chainEndsIn, cachedRuns, TRANSITION,
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

test('interpolation and screen coords write into reused arrays', () => {
  const parent = Int32Array.from([-1]);
  const out = new Float32Array(3);
  assert.deepEqual([...lerpXyr(parent, Float32Array.from([0, 0, 1]), Float32Array.from([10, 20, 3]), 0.5, out)], [5, 10, 2]);
  const coords = [];
  assert.equal(screenCoordsInto(Float32Array.from([10, 20, 5]), { k: 2, tx: 1, ty: 0 }, coords), coords);
  assert.deepEqual(coords[0], { cx: 21, cy: 40, r: 10 });
});

test('a circle moves with its parent; one absent on a side grows or shrinks in place', () => {
  const parent = Int32Array.from([-1, 0, 0]);
  // The root slides 10 right; child 1 keeps its offset; child 2 is new (radius 0 before, offset 5 in the new run).
  const from = Float32Array.from([0, 0, 50, 3, 0, 4, 99, 99, 0]);
  const to = Float32Array.from([10, 0, 50, 13, 0, 4, 15, 0, 2]);
  const mid = lerpXyr(parent, from, to, 0.5, new Float32Array(9));
  assert.deepEqual([...mid.slice(3, 6)], [8, 0, 4]);
  assert.deepEqual([...mid.slice(6, 9)], [10, 0, 1]);
});

const STEPS = 10;
const FIT_EPS = 1e-4;

/** Whether node `i` sits inside node `p` at every step of the move. */
function staysInside(parent, from, to, [i, p]) {
  const out = new Float32Array(from.length);
  return Array.from({ length: STEPS + 1 }, (_, s) => s / STEPS).every((t) => {
    const xyr = lerpXyr(parent, from, to, t, out);
    const [c, q] = [i * XYR_STRIDE, p * XYR_STRIDE];
    return Math.hypot(xyr[c] - xyr[q], xyr[c + 1] - xyr[q + 1]) + xyr[c + 2] <= xyr[q + 2] + FIT_EPS;
  });
}

test('a file arriving inside a new folder stays inside it at every step', () => {
  // Root, a folder that is new in the target (radius 10, offset 20), and its new file (radius 4, offset 5).
  const parent = Int32Array.from([-1, 0, 1]);
  const from = Float32Array.from([0, 0, 50, 0, 0, 0, 0, 0, 0]);
  const to = Float32Array.from([0, 0, 50, 20, 0, 10, 25, 0, 4]);
  assert.equal(staysInside(parent, from, to, [2, 1]), true);
  assert.equal(staysInside(parent, to, from, [2, 1]), true);
});

test('a file arriving inside a folder that grows stays inside it at every step', () => {
  // The folder grows from radius 6 to 12; the new file lands at offset 7 with radius 4.
  const parent = Int32Array.from([-1, 0, 1]);
  const from = Float32Array.from([0, 0, 50, 10, 0, 6, 0, 0, 0]);
  const to = Float32Array.from([0, 0, 50, 10, 0, 12, 17, 0, 4]);
  assert.equal(staysInside(parent, from, to, [2, 1]), true);
  assert.equal(staysInside(parent, to, from, [2, 1]), true);
});

test('every change between runs moves; nothing cross-fades', () => {
  assert.equal(transitionKind(0, 1), TRANSITION.MOVE);
  assert.equal(transitionKind(0, 9), TRANSITION.MOVE);
  assert.equal(transitionKind(1, 1), TRANSITION.NONE);
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
    const i = focusIndexFor(model, path);
    const { k, tx, ty } = runFocusTransform(model.parent, runLayout(model, 0), i);
    assert.ok([k, tx, ty].every(Number.isFinite) && k > 0, `${path}: camera ${k} ${tx} ${ty}`);
    assert.ok(model.nodes[i].children?.length, `${path}: frames a folder with circles in it`);
  }
});

test('the camera frames a folder at the run\'s size where the run draws it, or its nearest drawn ancestor', () => {
  const run = runLayout(MODEL, 0);
  const src = circleAt(run, at('src'));
  const cam = runFocusTransform(MODEL.parent, run, at('src'));
  assert.ok(Math.abs(src.x * cam.k + cam.tx - PACK_BASE_SIZE / 2) < 1e-3);
  assert.ok(Math.abs(src.r * cam.k - PACK_BASE_SIZE / 2) < 1e-3);
  // Run 2 does not hold lib/c.py, so lib is not drawn: the camera frames the root.
  const later = runLayout(MODEL, 2);
  assert.deepEqual(runFocusTransform(MODEL.parent, later, at('lib')), runFocusTransform(MODEL.parent, later, 0));
});

test('a folder holding only one folder in a run is drawn as that folder\'s chain end', () => {
  const ends = chainEndsIn(CHAIN, 0);
  const bc = CHAIN.pathIndex.get('a/b/c');
  assert.equal(ends[CHAIN.pathIndex.get('a')], CHAIN.pathIndex.get('a'));
  assert.equal(ends[bc], bc);
  const lone = buildTimelapseModel(decodeTimelapse({ ...PAYLOAD, fileNames: ['x/y/z.py', 'x/w.py'],
    frames: [{ day: '2026-09-01', files: [row(0, 1)], gone: [] }, { day: '2026-09-08', files: [row(1, 1)], gone: [] }] }));
  const x = lone.pathIndex.get('x');
  assert.equal(chainEndsIn(lone, 0)[x], lone.pathIndex.get('x/y'));
  assert.equal(chainEndsIn(lone, 1)[x], x);
});

test('cachedRuns computes each run once and forgets the oldest', () => {
  let calls = 0;
  const get = cachedRuns((k) => { calls += 1; return k * 2; }, 2);
  assert.deepEqual([get(1), get(1), get(2), get(3), get(1)], [2, 2, 4, 6, 2]);
  assert.equal(calls, 4);
});
