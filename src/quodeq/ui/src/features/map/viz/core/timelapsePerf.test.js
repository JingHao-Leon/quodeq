import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syntheticPayload } from './timelapseSynthetic.js';
import { decodeTimelapse } from '../../model/mapTimelapse.js';
import { buildTimelapseModel } from './timelapseModel.js';
import { anchorLayout, runLayout } from './timelapseLayout.js';
import { layoutModelOf } from './timelapseLayouts.js';
import { runNodeData, runPaint, lerpXyr, screenCoordsInto } from './timelapseScene.js';
import { createPaintTween, paintTweenAt } from './timelapseTween.js';
import { drawStatic } from './packLayers.js';
import { packViewport, hitCircle } from './packCanvasGeometry.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';
import { DEFAULT_SEVERITY_WEIGHTS } from './mapBadness.js';

// Budgets are generous so a busy CI machine passes; the real-hardware numbers
// come from the visual check. They still catch an accidental O(n²) per frame.
const FILES = 3000;
const RUNS = 30;
const FRAMES = 60;
const HOVERS = 200;
const RUN_LAYOUT_BUDGET_MS = 500;
const FRAME_BUDGET_MS = 16;
const HOVER_BUDGET_MS = 2;
const RUN_PAINT_BUDGET_MS = 250;
const SIZE = { w: 1200, h: 800 };
const C = (r, g, b) => ({ r, g, b });
const PALETTE = {
  bg: C(10, 10, 10), surfaceAlt: C(20, 20, 20), text: C(230, 230, 230), border: C(60, 60, 60),
  worse: C(240, 80, 120), better: C(0, 212, 255), neutral: C(138, 143, 168),
  activity: C(0, 212, 255), activityIdle: C(138, 155, 176), glassParent: C(200, 195, 216),
};

const DATA = decodeTimelapse(syntheticPayload({ files: FILES, runs: RUNS, seed: 11 }));
const MODEL = buildTimelapseModel(DATA);
const LAYOUT = layoutModelOf(MODEL);
const ANCHOR = anchorLayout(LAYOUT);
const IDENTITY = { k: 1, tx: 0, ty: 0 };

/** A 2D context whose every method does nothing and whose properties take any value. */
function stubContext() {
  const noop = () => {};
  return new Proxy({}, { get: (target, key) => (key in target ? target[key] : noop), set: (target, key, value) => { target[key] = value; return true; } });
}

function timed(fn) {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
}

function paintOfRun(k) {
  const nodeData = runNodeData(MODEL, DATA, k);
  return runPaint({ model: MODEL, nodeData, mode: PACK_COLOR_MODE.CONCENTRATION, palette: PALETTE, weights: DEFAULT_SEVERITY_WEIGHTS });
}

const lastRunPaint = () => paintOfRun(RUNS - 1);

test('a 3,000-file run lays out within the worker budget', () => {
  const { ms } = timed(() => runLayout(LAYOUT, ANCHOR, RUNS - 1));
  assert.ok(ms < RUN_LAYOUT_BUDGET_MS, `${ms.toFixed(0)} ms`);
});

test('a run\'s node data and paint fit the step budget', () => {
  const { ms } = timed(lastRunPaint);
  assert.ok(ms < RUN_PAINT_BUDGET_MS, `${ms.toFixed(0)} ms`);
});

test('a move frame (interpolate positions and colours, project, draw) averages under one 60 fps frame and allocates no coordinates or paint', () => {
  const from = runLayout(LAYOUT, ANCHOR, RUNS - 2);
  const to = runLayout(LAYOUT, ANCHOR, RUNS - 1);
  const tween = createPaintTween(paintOfRun(RUNS - 2), lastRunPaint());
  const buffer = new Float32Array(to.length);
  const coords = screenCoordsInto(lerpXyr(from, to, 0, buffer), IDENTITY, []);
  const firstCoord = coords[0];
  const paint = paintTweenAt(tween, 0);
  const firstPaint = [...paint];
  const ctx = stubContext();
  const viewport = packViewport(SIZE.w, SIZE.h);
  let drawn = 0;
  const { ms } = timed(() => {
    for (let f = 0; f < FRAMES; f++) {
      screenCoordsInto(lerpXyr(from, to, f / FRAMES, buffer), IDENTITY, coords);
      const frame = paintTweenAt(tween, f / FRAMES);
      drawn = drawStatic(ctx, { circles: MODEL.nodes, screenCoords: coords, viewport, paint: frame, index: MODEL.index, width: SIZE.w, height: SIZE.h });
    }
  });
  assert.ok(ms / FRAMES < FRAME_BUDGET_MS, `${(ms / FRAMES).toFixed(1)} ms per frame`);
  assert.equal(coords[0], firstCoord);
  assert.equal(paintTweenAt(tween, 1), paint);
  assert.ok(paint.every((p, i) => p === firstPaint[i]));
  assert.equal(coords.length, MODEL.nodes.length);
  assert.ok(drawn <= MODEL.nodes.length && drawn > 0);
});

test('hover hit testing stays far under a frame', () => {
  const coords = screenCoordsInto(runLayout(LAYOUT, ANCHOR, RUNS - 1), IDENTITY, []);
  const { ms } = timed(() => { for (let i = 0; i < HOVERS; i++) hitCircle(MODEL.nodes, coords, (i * 3) % 600, (i * 7) % 600); });
  assert.ok(ms / HOVERS < HOVER_BUDGET_MS, `${(ms / HOVERS).toFixed(2)} ms per hover`);
});
