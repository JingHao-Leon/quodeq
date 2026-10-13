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

test('scaled slots: in the latest run every circle whose folders are all in today\'s run sits on its anchor, folders and full-size files at their anchor size', () => {
  const last = RUNS - 1;
  const live = new Uint8Array(MODEL.parent.length);
  for (const i of nodes) if (isLeaf(i) && MODEL.sizes[last][i] > 0) for (let j = i; j >= 0; j = MODEL.parent[j]) live[j] = 1;
  const xyr = SCALED[last];
  let same = 0;
  for (const i of nodes) {
    const onAnchor = (o) => Math.abs(xyr[i * XYR_STRIDE + o] - ANCHOR[i * XYR_STRIDE + o]) <= NO_OVERLAP;
    let parentsLive = true;
    for (let j = MODEL.parent[i]; j >= 0; j = MODEL.parent[j]) parentsLive = parentsLive && live[j] === 1;
    if (!parentsLive) continue;
    assert.ok(onAnchor(0) && onAnchor(Y), `node ${i} position`);
    const full = isLeaf(i) ? MODEL.sizes[last][i] === MODEL.maxSize[i] : live[i] === 1;
    if (full) { assert.ok(onAnchor(R), `node ${i} radius`); same++; }
  }
  assert.ok(same >= nodes.filter((i) => !isLeaf(i) && live[i]).length, `${same} on their anchor`);
});

test('scaled slots: the earliest run is visibly smaller than the latest', () => {
  assert.ok(SCALED[0][R] < SCALED[RUNS - 1][R] * VISIBLY_SMALLER, `${SCALED[0][R]} vs ${SCALED[RUNS - 1][R]}`);
});

// root -> folders A (files 4, 5), B (file 6), C (file 7); run 1 moves content from B to A, the total holds;
// run 3 has nothing; run 4 is bigger than today; the latest run (5) is today: A and B full, C gone.
const SMALL = {
  parent: Int32Array.from([-1, 0, 0, 0, 1, 1, 2, 3]),
  maxSize: Float32Array.from([0, 0, 0, 0, 9, 9, 9, 4]),
  sizes: [
    Float32Array.from([0, 0, 0, 0, 4, 9, 9, 4]),
    Float32Array.from([0, 0, 0, 0, 9, 9, 4, 4]),
    Float32Array.from([0, 0, 0, 0, 9, 9, 4, 4]),
    Float32Array.from([0, 0, 0, 0, 0, 0, 0, 0]),
    Float32Array.from([0, 0, 0, 0, 9, 9, 9, 4]),
    Float32Array.from([0, 0, 0, 0, 9, 9, 9, 0]),
  ],
};
const SMALL_ANCHOR = anchorLayout(SMALL);
const smallRun = (k) => runLayout(SMALL, SMALL_ANCHOR, k, LAYOUT_MODE.SCALED_SLOTS);
const TODAY = 18 + 9 + ABSENT_LEAF_RADIUS ** 2;

const scaleIn = (xyr, i) => xyr[i * XYR_STRIDE + R] / SMALL_ANCHOR[i * XYR_STRIDE + R];
const close = (a, b) => Math.abs(a - b) < EPS;

test('scaled slots: the root\'s scale is the root of its run content over today\'s, capped at 1', () => {
  assert.ok(close(scaleIn(smallRun(0), 0), Math.sqrt(26 / TODAY)));
  assert.ok(close(scaleIn(smallRun(4), 0), 1), 'a run bigger than today fills the anchor');
  assert.ok(close(scaleIn(smallRun(5), 0), 1));
});

test('scaled slots: a folder in today\'s run is scaled against its content today, one gone by today against its peak, both capped by the parent', () => {
  const xyr = smallRun(0);
  const root = Math.sqrt(26 / TODAY);
  assert.ok(close(scaleIn(xyr, 1), Math.sqrt(13 / 18)));
  assert.ok(close(scaleIn(xyr, 2), root), 'B is as full as today, so it takes its parent\'s scale');
  assert.ok(close(scaleIn(xyr, 3), root), 'C is at its peak, capped by its parent');
  assert.ok(close(scaleIn(smallRun(5), 3), Math.sqrt(ABSENT_LEAF_RADIUS ** 2 / 4)));
});

test('scaled slots: the latest run is the anchor, except what is smaller or gone today', () => {
  const xyr = smallRun(5);
  for (const i of [0, 1, 2, 4, 5, 6]) assert.deepEqual([...xyr.subarray(i * XYR_STRIDE, (i + 1) * XYR_STRIDE)], [...SMALL_ANCHOR.subarray(i * XYR_STRIDE, (i + 1) * XYR_STRIDE)]);
  assert.ok(xyr[3 * XYR_STRIDE + R] < SMALL_ANCHOR[3 * XYR_STRIDE + R]);
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
