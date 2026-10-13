// src/quodeq/ui/src/features/map/viz/core/skyLabels.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseLabelled, mustLabelled, placeSkyLabels, LABEL_LINE_PX, LABEL_BLOCK_PX } from './skyLabels.js';
import { AREA_KIND } from '../../mapVocab.js';

const TOP = 10;
const areaOf = (kind, weight) => ({ kind, stats: { weight } });

test('ring kinds always, then the ten heaviest, plus hover and selection', () => {
  const areas = Array.from({ length: 14 }, (_, i) => areaOf(AREA_KIND.WATCH, i));
  areas[0] = areaOf(AREA_KIND.DORMANT, 0);
  const chosen = chooseLabelled({ areas, hovered: 1, selected: null });
  assert.ok(chosen.has(0) && chosen.has(1));
  assert.ok(chosen.has(13) && !chosen.has(2));
  assert.equal(chosen.size, TOP + 2);
});

test('a label never sits on another bubble or label', () => {
  const bubbles = [{ px: 100, py: 100, R: 30 }, { px: 100, py: 160, R: 20 }];
  const placed = placeSkyLabels({ bubbles, wanted: new Set([0, 1]), must: new Set(), measure: () => 60 });
  const first = placed.find((p) => p.index === 0);
  assert.ok(first.y < 100);   // below would hit bubble 1, so it goes above
});

test('a wanted label (outside the ten heaviest) with no bubble-free spot is dropped, a must label wins over bubbles', () => {
  const bubbles = [{ px: 50, py: 50, R: 10 }, { px: 50, py: 50, R: 200 }];
  const wantedOnly = placeSkyLabels({ bubbles, wanted: new Set([0]), must: new Set(), measure: () => 40 });
  const mustToo = placeSkyLabels({ bubbles, wanted: new Set([0]), must: new Set([0]), measure: () => 40 });
  assert.equal(wantedOnly.length, 0);
  assert.equal(mustToo.length, 1);
});

const watchAreas = (n) => Array.from({ length: n }, (_, i) => areaOf(AREA_KIND.WATCH, i));

test('with labels on, the ten heaviest areas must show', () => {
  const must = mustLabelled({ areas: watchAreas(TOP + 1), hovered: null, selected: null, showLabels: true });
  assert.equal(must.size, TOP);
  assert.ok(!must.has(0));
});

test('with labels off, only ring kinds, hover and selection must show', () => {
  const areas = watchAreas(TOP + 1);
  areas[0] = areaOf(AREA_KIND.HOTSPOT, 0);
  const must = mustLabelled({ areas, hovered: 3, selected: null, showLabels: false });
  assert.deepEqual([...must].sort((a, b) => a - b), [0, 3]);
});

const LABEL_W = 60;
const DENSE_SIDE = 12;
const DENSE_STEP = 22;
const DENSE_R = 9;
const boxOf = (p) => ({ x0: p.x - LABEL_W / 2, x1: p.x + LABEL_W / 2, y0: p.y - LABEL_LINE_PX, y1: p.y + LABEL_BLOCK_PX - LABEL_LINE_PX });
const boxesMeet = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function anyLabelsOverlap(placed) {
  const boxes = placed.map(boxOf);
  return boxes.some((a, i) => boxes.slice(i + 1).some((b) => boxesMeet(a, b)));
}

test('in a dense sky of must labels, no two placed labels overlap', () => {
  const bubbles = Array.from({ length: DENSE_SIDE * DENSE_SIDE }, (_, i) => ({ px: (i % DENSE_SIDE) * DENSE_STEP, py: Math.floor(i / DENSE_SIDE) * DENSE_STEP, R: DENSE_R }));
  const all = new Set(bubbles.map((_, i) => i));
  const placed = placeSkyLabels({ bubbles, wanted: all, must: all, measure: () => LABEL_W });
  assert.ok(placed.length > 0 && placed.length < bubbles.length);
  assert.equal(anyLabelsOverlap(placed), false);
});

const STACKED = 6;

test('must labels whose near spots hold other labels move further out', () => {
  const bubbles = Array.from({ length: STACKED }, () => ({ px: 200, py: 200, R: 10 }));
  const must = new Set(bubbles.map((_, i) => i));
  const placed = placeSkyLabels({ bubbles, wanted: new Set(), must, measure: () => LABEL_W });
  assert.equal(placed.length, STACKED);
  assert.equal(anyLabelsOverlap(placed), false);
});
