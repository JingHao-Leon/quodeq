import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorLayout, runLayout } from './timelapseLayout.js';
import { childrenOutside, maxSiblingOverlap, OVERLAP_TOLERANCE } from './layoutChecks.js';
import { syntheticModel } from './timelapseSynthetic.js';
import { PACK_BASE_SIZE, XYR_STRIDE, XYR_R as R } from './packLayout.js';

const FILES = 400;
const RUNS = 8;
const HALF = PACK_BASE_SIZE / 2;
const MODEL = syntheticModel({ files: FILES, runs: RUNS, seed: 3 });
const ANCHOR = anchorLayout(MODEL);
const RUN_LAYOUTS = Array.from({ length: RUNS }, (_, k) => runLayout(MODEL, k));
const kids = Array.from(MODEL.parent, () => []);
for (let i = 1; i < MODEL.parent.length; i++) kids[MODEL.parent[i]].push(i);
const rOf = (xyr, i) => xyr[i * XYR_STRIDE + R];

/** Whether run k holds node i: a file with checks, or a folder holding one. */
function holds(k, i) {
  return kids[i].length ? kids[i].some((c) => holds(k, c)) : MODEL.sizes[k][i] > 0;
}

test('the anchor is today\'s map, centred', () => {
  assert.deepEqual([ANCHOR[0], ANCHOR[1], ANCHOR[R]].map((v) => Math.round(v)), [HALF, HALF, HALF]);
  assert.equal(ANCHOR.length, MODEL.parent.length * XYR_STRIDE);
});

test('the latest run is the anchor itself', () => {
  assert.deepEqual(RUN_LAYOUTS[RUNS - 1], ANCHOR);
});

test('a run draws only what it holds: everything else has radius 0', () => {
  for (const k of [0, RUNS >> 1, RUNS - 1]) {
    for (let i = 1; i < MODEL.parent.length; i++) assert.equal(rOf(RUN_LAYOUTS[k], i) > 0, holds(k, i), `run ${k} node ${i}`);
  }
});

test('in every run no child leaves its parent and no siblings overlap', () => {
  RUN_LAYOUTS.forEach((xyr, k) => {
    assert.equal(childrenOutside(MODEL.parent, xyr), 0, `run ${k}`);
    assert.ok(maxSiblingOverlap(MODEL.parent, xyr) <= OVERLAP_TOLERANCE, `run ${k}`);
  });
});

test('a folder holding only one folder in a run is drawn as that folder', () => {
  const chain = { parent: Int32Array.from([-1, 0, 1, 2, 1, 0, 5]), sizes: [
    Float32Array.from([0, 0, 0, 4, 0, 0, 2]), Float32Array.from([0, 0, 0, 4, 3, 0, 2]),
  ], maxSize: Float32Array.from([0, 0, 0, 4, 3, 0, 2]) };
  // Node 1 holds folder 2 and file 4; in run 0 file 4 is absent, so 1 is drawn as 2.
  const run0 = runLayout(chain, 0);
  assert.deepEqual([...run0.slice(XYR_STRIDE, 2 * XYR_STRIDE)], [...run0.slice(2 * XYR_STRIDE, 3 * XYR_STRIDE)]);
  const run1 = runLayout(chain, 1);
  assert.ok(rOf(run1, 1) > rOf(run1, 2));
});

test('a run lays out the same whatever was laid out before it', () => {
  const fresh = syntheticModel({ files: FILES, runs: RUNS, seed: 3 });
  assert.deepEqual(runLayout(fresh, 2), RUN_LAYOUTS[2]);
});
