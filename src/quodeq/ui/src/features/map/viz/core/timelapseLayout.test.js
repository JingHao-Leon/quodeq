import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorLayout, runLayout, runContent, fileChurn, LAYOUT_MODE, TIMELAPSE_LAYOUT_MODE } from './timelapseLayout.js';
import { childrenOutside, maxSiblingOverlap, folderMovements, percentile, OVERLAP_TOLERANCE } from './layoutChecks.js';
import { syntheticModel } from './timelapseSynthetic.js';
import { PACK_BASE_SIZE, XYR_STRIDE, XYR_R as R } from './packLayout.js';

const FILES = 600;
const RUNS = 12;
const HALF = PACK_BASE_SIZE / 2;
const EPS = 1e-3;
const MODEL = syntheticModel({ files: FILES, runs: RUNS, seed: 3 });
const ANCHOR = anchorLayout(MODEL);
const runs = (mode) => Array.from({ length: RUNS }, (_, k) => runLayout(MODEL, ANCHOR, k, mode));
const RELAXED = runs(LAYOUT_MODE.RELAX);
const SLOTS = runs(LAYOUT_MODE.FIXED_SLOTS);
const PLAYED = runs(TIMELAPSE_LAYOUT_MODE);
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

// The 0.02 p90 movement budget was written against jitter from the relaxation.
// Scaled slots move on purpose (folders grow with their content): on this
// history their p90 is 0.023-0.026 (seeds 1-5), all of it on growth steps.
// What the played mode must hold instead: motion follows content, and nothing
// moves without a reason.
const CONTENT = Array.from({ length: RUNS }, (_, k) => runContent(MODEL, k));
const ancestry = (i) => { const out = []; for (let j = i; j >= 0; j = MODEL.parent[j]) out.push(j); return out; };

test('a folder whose content and whose ancestors\' content all grow (or all shrink) never resizes the other way, in the mode the app plays', () => {
  let checked = 0;
  for (let k = 1; k < RUNS; k++) {
    for (const i of MODEL.parent.keys()) {
      if (isLeaf(i)) continue;
      const deltas = ancestry(i).map((j) => CONTENT[k][j] - CONTENT[k - 1][j]);
      const dr = PLAYED[k][i * XYR_STRIDE + R] - PLAYED[k - 1][i * XYR_STRIDE + R];
      if (deltas.every((d) => d >= 0)) { checked++; assert.ok(dr >= -EPS, `folder ${i} run ${k}`); }
      if (deltas.every((d) => d <= 0)) { checked++; assert.ok(dr <= EPS, `folder ${i} run ${k}`); }
    }
  }
  assert.ok(checked > 0);
});

/** Per step k, the folders whose own content and every ancestor's content are the same in runs k - 1 and k. */
function untouchedFolders(model) {
  const content = model.sizes.map((_, k) => runContent(model, k));
  const out = [];
  for (let k = 1; k < model.sizes.length; k++) {
    for (const i of model.parent.keys()) {
      if (model.fileOf[i] >= 0) continue;
      let same = true;
      for (let j = i; j >= 0 && same; j = model.parent[j]) same = content[k][j] === content[k - 1][j];
      if (same) out.push({ k, i });
    }
  }
  return out;
}

/** Run `k` of MODEL, then the same run with one check taken off a file in one top folder and added to a file in another (the root total holds). */
function shiftedModel(k) {
  const topOf = (i) => { let j = i; while (MODEL.parent[j] > 0) j = MODEL.parent[j]; return j; };
  const files = [...MODEL.parent.keys()].filter((i) => isLeaf(i) && MODEL.sizes[k][i] > 2);
  const from = files[0];
  const to = files.find((i) => topOf(i) !== topOf(from));
  const shifted = Float32Array.from(MODEL.sizes[k]);
  shifted[from] -= 1;
  shifted[to] += 1;
  const sizes = [MODEL.sizes[k], shifted, MODEL.sizes[RUNS - 1]];
  const maxSize = Float32Array.from(MODEL.maxSize, (m, i) => Math.max(m, shifted[i]));
  return { parent: MODEL.parent, fileOf: MODEL.fileOf, sizes, maxSize };
}

test('a folder whose own content and every ancestor\'s content are unchanged keeps x, y and r bit-identical, in the mode the app plays', () => {
  const model = shiftedModel(RUNS / 2);
  const anchor = anchorLayout(model);
  const [before, after] = [0, 1].map((k) => runLayout(model, anchor, k));
  const untouched = untouchedFolders(model);
  assert.ok(after[R] < anchor[R], 'the map is below today\'s size, so a scale change would move things');
  assert.ok(untouched.filter(({ i }) => i > 0).length > 1, 'sub-folders are untouched while content moved between others');
  for (const { i } of untouched.filter((u) => u.k === 1)) {
    const at = (xyr) => [...xyr.subarray(i * XYR_STRIDE, (i + 1) * XYR_STRIDE)];
    assert.deepEqual(at(after), at(before), `folder ${i}`);
  }
  assert.ok(percentile(folderMovements(model.parent, before, after), 1) > 0, 'the two touched sub-trees do move');
});

test('folders move when the root content changes while the map is below today\'s size, in the mode the app plays', () => {
  const rootScale = (k) => PLAYED[k][R] / ANCHOR[R];
  let checked = 0;
  for (let k = 1; k < RUNS; k++) {
    if (CONTENT[k][0] === CONTENT[k - 1][0] || Math.min(rootScale(k), rootScale(k - 1)) >= 1) continue;
    checked++;
    assert.ok(percentile(folderMovements(MODEL.parent, PLAYED[k - 1], PLAYED[k]), 1) > 0, `run ${k}`);
  }
  assert.ok(checked > 0);
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
