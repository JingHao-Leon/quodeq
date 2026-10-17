import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutHandler, createTimelapseHandler, TIMELAPSE_MESSAGE } from './timelapseWorker.js';
import { anchorLayout, runLayout } from './timelapseLayout.js';
import { syntheticModel } from './timelapseSynthetic.js';

const MODEL = syntheticModel({ files: 80, runs: 4, seed: 5 });
const LAYOUT = { parent: MODEL.parent, sizes: MODEL.sizes, maxSize: MODEL.maxSize };

test('the handler lays out the anchor once and any run after it', () => {
  const handle = createTimelapseHandler();
  const anchor = handle({ id: 9, type: TIMELAPSE_MESSAGE.MODEL, model: LAYOUT });
  assert.deepEqual(anchor, { id: 9, xyr: anchorLayout(LAYOUT) });
  const run = handle({ id: 10, type: TIMELAPSE_MESSAGE.RUN, modelId: 9, run: 3 });
  assert.deepEqual(run.xyr, runLayout(LAYOUT, 3));
});

test('a run for a model the worker does not hold is an error, not a guess', () => {
  const handle = createTimelapseHandler();
  assert.ok(handle({ id: 3, type: TIMELAPSE_MESSAGE.RUN, modelId: 1, run: 0 }).error);
});

test('a job that throws is answered with its error, not a crashed worker', () => {
  const handle = createLayoutHandler();
  const reply = handle({ id: 4, type: TIMELAPSE_MESSAGE.MODEL, model: { parent: null } });
  assert.equal(reply.id, 4);
  assert.equal(typeof reply.error, 'string');
});

test('the layout handler still answers a plain pack', () => {
  const reply = createLayoutHandler()({ id: 5, slim: { v: 1 } });
  assert.equal(reply.id, 5);
  assert.ok(reply.xyr.length > 0);
});
