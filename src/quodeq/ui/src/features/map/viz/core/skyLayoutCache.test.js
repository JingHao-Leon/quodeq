// src/quodeq/ui/src/features/map/viz/core/skyLayoutCache.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutCache, SKY_LAYOUT_CACHE_SIZE } from './skyLayoutCache.js';

const area = (name, density, files) => ({ name, density, stats: { files } });
let cache;
beforeEach(() => { cache = createLayoutCache(); });
const sky = (tag) => [area(`${tag}-a`, 0.3, 12), area(`${tag}-b`, 0.8, 40)];

test('the same areas, even in fresh objects, reuse the cached layout', () => {
  const first = cache.layout(sky('same'));
  assert.equal(cache.layout(sky('same')), first);
});

test('a change in density or file count lays out again', () => {
  const first = cache.layout(sky('change'));
  const moved = sky('change');
  moved[0] = area('change-a', 2.5, 12);
  assert.notEqual(cache.layout(moved), first);
});

test('only the last few layouts are kept', () => {
  const oldest = cache.layout(sky('evict-0'));
  for (let i = 1; i <= SKY_LAYOUT_CACHE_SIZE; i++) cache.layout(sky(`evict-${i}`));
  assert.notEqual(cache.layout(sky('evict-0')), oldest);
});

test('clear forgets every layout', () => {
  const first = cache.layout(sky('clear'));
  cache.clear();
  assert.notEqual(cache.layout(sky('clear')), first);
});
