import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimelapseHandler, TIMELAPSE_MESSAGE } from './timelapseWorker.js';
import { anchorLayout, runLayout } from './timelapseLayout.js';
import { syntheticModel } from './timelapseSynthetic.js';

const MODEL = syntheticModel({ files: 80, runs: 4, seed: 5 });
const LAYOUT = { parent: MODEL.parent, sizes: MODEL.sizes, maxSize: MODEL.maxSize };

test('the handler lays out the anchor once and any run after it', () => {
  const handle = createTimelapseHandler();
  const anchor = handle({ id: 1, type: TIMELAPSE_MESSAGE.MODEL, modelId: 9, model: LAYOUT });
  assert.deepEqual(anchor, { id: 1, xyr: anchorLayout(LAYOUT) });
  const run = handle({ id: 2, type: TIMELAPSE_MESSAGE.RUN, modelId: 9, run: 3 });
  assert.deepEqual(run.xyr, runLayout(LAYOUT, anchorLayout(LAYOUT), 3));
});

test('a run for a model the worker does not hold is an error, not a guess', () => {
  const handle = createTimelapseHandler();
  assert.ok(handle({ id: 3, type: TIMELAPSE_MESSAGE.RUN, modelId: 1, run: 0 }).error);
});
