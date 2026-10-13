import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimelapseLayouts, layoutModelOf } from './timelapseLayouts.js';
import { anchorLayout, runLayout } from './timelapseLayout.js';
import { syntheticModel } from './timelapseSynthetic.js';

const MODEL = syntheticModel({ files: 60, runs: 3, seed: 2 });

test('without a worker the layouts are computed on this thread and cached', async () => {
  const layouts = createTimelapseLayouts(MODEL);
  const anchor = await layouts.anchor();
  assert.deepEqual(anchor, anchorLayout(layoutModelOf(MODEL)));
  assert.deepEqual(await layouts.run(2), runLayout(layoutModelOf(MODEL), anchor, 2));
  assert.equal(layouts.run(2), layouts.run(2));
});
