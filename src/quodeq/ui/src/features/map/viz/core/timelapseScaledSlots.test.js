import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorLayout, runLayout, LAYOUT_MODE, TIMELAPSE_LAYOUT_MODE, MIN_FOLDER_SCALE, ABSENT_LEAF_RADIUS } from './timelapseLayout.js';
import { childrenOutside, maxSiblingOverlap } from './layoutChecks.js';
import { syntheticModel } from './timelapseSynthetic.js';
import { XYR_STRIDE, XYR_Y as Y, XYR_R as R } from './packLayout.js';

const FILES = 600;
const RUNS = 12;
const EPS = 1e-3;
const NO_OVERLAP = 1e-6;
const VISIBLY_SMALLER = 0.8;
const MODEL = syntheticModel({ files: FILES, runs: RUNS, seed: 3 });
const ANCHOR = anchorLayout(MODEL);
const SCALED = Array.from({ length: RUNS }, (_, k) => runLayout(MODEL, ANCHOR, k, LAYOUT_MODE.SCALED_SLOTS));
const isLeaf = (i) => MODEL.fileOf[i] >= 0;
const nodes = [...MODEL.parent.keys()];
const at = (xyr, i) => ({ x: xyr[i * XYR_STRIDE], y: xyr[i * XYR_STRIDE + Y], r: xyr[i * XYR_STRIDE + R] });
/** A run's scale of folder i: its radius over its anchor radius. */
const scaleOf = (xyr, i) => xyr[i * XYR_STRIDE + R] / ANCHOR[i * XYR_STRIDE + R];

test('scaled slots are the layout the app plays', () => {
  assert.equal(TIMELAPSE_LAYOUT_MODE, LAYOUT_MODE.SCALED_SLOTS);
});

test('scaled slots: no child outside its parent and no sibling overlap in any run', () => {
  assert.deepEqual(SCALED.map((xyr) => childrenOutside(MODEL.parent, xyr)), new Array(RUNS).fill(0));
  for (const xyr of SCALED) assert.ok(maxSiblingOverlap(MODEL.parent, xyr) <= NO_OVERLAP, `${maxSiblingOverlap(MODEL.parent, xyr)}`);
});

test('scaled slots: no circle outgrows its anchor and every folder keeps at least the minimum scale', () => {
  for (const xyr of SCALED) {
    for (const i of nodes) {
      assert.ok(xyr[i * XYR_STRIDE + R] <= ANCHOR[i * XYR_STRIDE + R] + EPS);
      if (!isLeaf(i)) assert.ok(scaleOf(xyr, i) >= MIN_FOLDER_SCALE - EPS);
    }
  }
});

test('scaled slots: a child sits at its anchor offset scaled by its parent, measured from the parent\'s run centre', () => {
  for (const xyr of SCALED) {
    for (const i of nodes.slice(1)) {
      const p = MODEL.parent[i];
      const s = scaleOf(xyr, p);
      const [c, q, ac, aq] = [at(xyr, i), at(xyr, p), at(ANCHOR, i), at(ANCHOR, p)];
      assert.ok(Math.abs(c.x - q.x - (ac.x - aq.x) * s) < EPS && Math.abs(c.y - q.y - (ac.y - aq.y) * s) < EPS, `node ${i}`);
    }
  }
});

test('scaled slots: a sub-folder is never scaled above its parent, and a file is its run size in its parent\'s scale', () => {
  const unit = ANCHOR[nodes.find(isLeaf) * XYR_STRIDE + R] / Math.sqrt(MODEL.maxSize[nodes.find(isLeaf)]);
  for (let k = 0; k < RUNS; k++) {
    for (const i of nodes.slice(1)) {
      const s = scaleOf(SCALED[k], MODEL.parent[i]);
      if (!isLeaf(i)) { assert.ok(scaleOf(SCALED[k], i) <= s + EPS); continue; }
      const size = MODEL.sizes[k][i];
      const own = size > 0 ? Math.sqrt(Math.max(1, size)) : ABSENT_LEAF_RADIUS;
      assert.ok(Math.abs(SCALED[k][i * XYR_STRIDE + R] - own * unit * s) < EPS, `file ${i} run ${k}`);
    }
  }
});

test('scaled slots: the earliest run is visibly smaller than the latest', () => {
  assert.ok(SCALED[0][R] < SCALED[RUNS - 1][R] * VISIBLY_SMALLER, `${SCALED[0][R]} vs ${SCALED[RUNS - 1][R]}`);
});

// root -> folders A (files 4, 5), B (file 6), C (file 7); run 1 moves content from B to A, the total holds.
const SMALL = {
  parent: Int32Array.from([-1, 0, 0, 0, 1, 1, 2, 3]),
  maxSize: Float32Array.from([0, 0, 0, 0, 9, 9, 9, 4]),
  sizes: [
    Float32Array.from([0, 0, 0, 0, 4, 9, 9, 4]),
    Float32Array.from([0, 0, 0, 0, 9, 9, 4, 4]),
    Float32Array.from([0, 0, 0, 0, 9, 9, 4, 4]),
    Float32Array.from([0, 0, 0, 0, 0, 0, 0, 0]),
    Float32Array.from([0, 0, 0, 0, 4, 0, 9, 4]),
  ],
};
const SMALL_ANCHOR = anchorLayout(SMALL);
const smallRun = (k) => runLayout(SMALL, SMALL_ANCHOR, k, LAYOUT_MODE.SCALED_SLOTS);

const scaleIn = (xyr, i) => xyr[i * XYR_STRIDE + R] / SMALL_ANCHOR[i * XYR_STRIDE + R];
const close = (a, b) => Math.abs(a - b) < EPS;

test('scaled slots: a folder\'s scale is the root of its run content over its peak content in any run', () => {
  const xyr = smallRun(0);
  assert.ok(close(scaleIn(xyr, 0), 1), 'the root is full size in its fullest run');
  assert.ok(close(scaleIn(xyr, 1), Math.sqrt(13 / 18)));
  assert.ok(close(scaleIn(xyr, 2), 1));
});

test('scaled slots: a full folder in a shrunk parent takes the parent\'s scale', () => {
  const xyr = smallRun(4);
  const root = Math.sqrt((4 + ABSENT_LEAF_RADIUS ** 2 + 9 + 4) / 26);
  assert.ok(close(scaleIn(xyr, 0), root));
  assert.ok(close(scaleIn(xyr, 2), root));
});

test('scaled slots: when content moves between folders but the total holds, an unchanged folder does not move at all', () => {
  const [a, b] = [smallRun(0), smallRun(1)];
  for (const i of [0, 3, 7]) assert.deepEqual([...b.subarray(i * XYR_STRIDE, (i + 1) * XYR_STRIDE)], [...a.subarray(i * XYR_STRIDE, (i + 1) * XYR_STRIDE)]);
  assert.ok(b[1 * XYR_STRIDE + R] > a[1 * XYR_STRIDE + R] && b[2 * XYR_STRIDE + R] < a[2 * XYR_STRIDE + R]);
});

test('scaled slots: a run equal to the one before lays out exactly the same', () => {
  assert.deepEqual(smallRun(2), smallRun(1));
});

test('scaled slots: a folder of absent files stays a small circle at the minimum scale or above', () => {
  const xyr = smallRun(3);
  for (const i of [0, 1, 2, 3]) assert.ok(xyr[i * XYR_STRIDE + R] >= SMALL_ANCHOR[i * XYR_STRIDE + R] * MIN_FOLDER_SCALE - EPS);
  for (const i of [4, 5, 6, 7]) assert.ok(xyr[i * XYR_STRIDE + R] > 0);
});
