// src/quodeq/ui/src/features/map/viz/core/skyLayoutCache.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedLayoutSky, SKY_LAYOUT_CACHE_SIZE } from './skyLayoutCache.js';

const area = (name, needPct, files) => ({ name, needPct, stats: { files } });
const sky = (tag) => [area(`${tag}-a`, 0.3, 12), area(`${tag}-b`, 0.8, 40)];

test('the same areas, even in fresh objects, reuse the cached layout', () => {
  const first = cachedLayoutSky(sky('same'));
  assert.equal(cachedLayoutSky(sky('same')), first);
});

test('a change in need or file count lays out again', () => {
  const first = cachedLayoutSky(sky('change'));
  const moved = sky('change');
  moved[0] = area('change-a', 0.9, 12);
  assert.notEqual(cachedLayoutSky(moved), first);
});

test('only the last few layouts are kept', () => {
  const oldest = cachedLayoutSky(sky('evict-0'));
  for (let i = 1; i <= SKY_LAYOUT_CACHE_SIZE; i++) cachedLayoutSky(sky(`evict-${i}`));
  assert.notEqual(cachedLayoutSky(sky('evict-0')), oldest);
});
