import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorLayout, runLayout, fileChurn, LAYOUT_MODE, TIMELAPSE_LAYOUT_MODE, CROSSFADE_CHURN } from './timelapseLayout.js';
import { childrenOutside, maxSiblingOverlap, folderMovements, percentile, OVERLAP_TOLERANCE } from './layoutChecks.js';
import { syntheticModel } from './timelapseSynthetic.js';
import { PACK_BASE_SIZE, XYR_STRIDE } from './packLayout.js';

const FILES = 600;
const RUNS = 12;
const HALF = PACK_BASE_SIZE / 2;
const EPS = 1e-3;
const MOVE_P90_MAX = 0.02;
const MODEL = syntheticModel({ files: FILES, runs: RUNS, seed: 3 });
const ANCHOR = anchorLayout(MODEL);
const R = 2;
const runs = (mode) => Array.from({ length: RUNS }, (_, k) => runLayout(MODEL, ANCHOR, k, mode));
const RELAXED = runs(LAYOUT_MODE.RELAX);
const SLOTS = runs(LAYOUT_MODE.FIXED_SLOTS);
const PLAYED = { [LAYOUT_MODE.RELAX]: RELAXED, [LAYOUT_MODE.FIXED_SLOTS]: SLOTS }[TIMELAPSE_LAYOUT_MODE];
const isLeaf = (i) => MODEL.fileOf[i] >= 0;

test('the anchor is the whole map, centred', () => {
  assert.deepEqual([ANCHOR[0], ANCHOR[1], ANCHOR[R]].map((v) => Math.round(v)), [HALF, HALF, HALF]);
  assert.equal(ANCHOR.length, MODEL.parent.length * XYR_STRIDE);
});

for (const [mode, layouts] of [[LAYOUT_MODE.RELAX, RELAXED], [LAYOUT_MODE.FIXED_SLOTS, SLOTS]]) {
  test(`${mode}: no child outside its parent in any run`, () => {
    assert.deepEqual(layouts.map((xyr) => childrenOutside(MODEL.parent, xyr)), new Array(RUNS).fill(0));
  });

  test(`${mode}: no sibling overlap above the tolerance in any run`, () => {
    assert.ok(layouts.every((xyr) => maxSiblingOverlap(MODEL.parent, xyr) <= OVERLAP_TOLERANCE));
  });

  test(`${mode}: every circle keeps a slot, an absent file's is smaller than any present file's, no run outgrows the anchor`, () => {
    for (let k = 0; k < RUNS; k++) {
      const xyr = layouts[k];
      const radii = (present) => [...MODEL.parent.keys()].filter((i) => isLeaf(i) && (MODEL.sizes[k][i] > 0) === present).map((i) => xyr[i * XYR_STRIDE + R]);
      const absent = radii(false);
      assert.ok([...MODEL.parent.keys()].every((i) => xyr[i * XYR_STRIDE + R] > 0));
      if (absent.length) assert.ok(Math.max(...absent) < Math.min(...radii(true)) + EPS);
      assert.ok(xyr[R] <= ANCHOR[R] + EPS);
    }
  });
}

test('folders move little between runs that do not cross-fade, in the mode the app plays', () => {
  const moves = [];
  for (let k = 1; k < RUNS; k++) {
    if (fileChurn(MODEL, k - 1, k) <= CROSSFADE_CHURN) moves.push(...folderMovements(MODEL.parent, PLAYED[k - 1], PLAYED[k]));
  }
  assert.ok(moves.length > 0);
  assert.ok(percentile(moves, 0.9) <= MOVE_P90_MAX, `p90 ${percentile(moves, 0.9)}`);
});

test('fixed slots keep every circle where the anchor put it', () => {
  const last = SLOTS[RUNS - 1];
  for (let i = 0; i < MODEL.parent.length; i++) {
    const o = i * XYR_STRIDE;
    assert.deepEqual([last[o], last[o + 1]], [ANCHOR[o], ANCHOR[o + 1]]);
    assert.ok(last[o + R] <= ANCHOR[o + R] + EPS);
  }
});

test('churn is the share of files that appear or leave', () => {
  const model = { parent: Int32Array.from([-1, 0, 0, 0]), sizes: [Float32Array.from([0, 1, 1, 0]), Float32Array.from([0, 1, 0, 1])], maxSize: Float32Array.from([0, 1, 1, 1]) };
  assert.equal(fileChurn(model, 0, 1), 2 / 3);
  assert.equal(fileChurn(model, 0, 0), 0);
});

test('the same history always lays out the same', () => {
  assert.deepEqual(runLayout(MODEL, anchorLayout(MODEL), RUNS - 1, LAYOUT_MODE.RELAX), RELAXED[RUNS - 1]);
});
