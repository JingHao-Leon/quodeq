// src/quodeq/ui/src/features/map/viz/core/skyLabels.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseLabelled, placeSkyLabels } from './skyLabels.js';
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

test('a wanted label with no free spot is dropped, a must label is kept', () => {
  const bubbles = [{ px: 50, py: 50, R: 10 }, { px: 50, py: 50, R: 200 }];
  const wantedOnly = placeSkyLabels({ bubbles, wanted: new Set([0]), must: new Set(), measure: () => 40 });
  const mustToo = placeSkyLabels({ bubbles, wanted: new Set([0]), must: new Set([0]), measure: () => 40 });
  assert.equal(wantedOnly.length, 0);
  assert.equal(mustToo.length, 1);
});
