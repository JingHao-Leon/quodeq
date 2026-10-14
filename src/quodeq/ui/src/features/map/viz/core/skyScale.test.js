import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  densityDistance, densityTop, skyScale, skyRings, zoneOf, bubbleRadius,
  FIX_FIRST_DENSITY, WATCH_DENSITY, SCALE_FLOOR, SKY_TOP_PERCENTILE, OUTLIER_CAP,
  EMPTY_FIX_FIRST, MIN_FIX_FIRST, MIN_WATCH,
} from './skyScale.js';
import { SKY_RIM } from './skyLayout.js';
import { SKY_ZONE } from '../../mapVocab.js';

const EPS = 1e-6;
const FILES = 5;
const MESSY_TOP = 6;
const HALF_DENSITY = 0.5;
const CLEAN = [0, 0.08, 0.15, 0.46];
const SPREAD_AREAS = 20;
const SPREAD_MAX = 2;
const BENCHMARK_LIKE = [4.41, 0.94, 0.6];
const BENCHMARK_TOP = 1.88;
const OUTLIER = 9;
const HOT = 1.2;
const WARM = 0.6;
const COOL = 0.2;
const MANY = 12;
const BIG_FILES = 400;
const area = (name, density, files = FILES) => ({ name, density, stats: { files } });
// Twenty areas spread evenly up to SPREAD_MAX: a project with a heavy but ordinary tail.
const spread = () => Array.from({ length: SPREAD_AREAS }, (_, i) => area(`s${i}`, ((i + 1) / SPREAD_AREAS) * SPREAD_MAX));
const many = (prefix, density, count = MANY) => Array.from({ length: count }, (_, i) => area(`${prefix}${i}`, density));

/** The linearly interpolated SKY_TOP_PERCENTILE of the spread fixture, computed independently of densityTop. */
function spreadPercentile() {
  const sorted = spread().map((a) => a.density);
  const at = (sorted.length - 1) * SKY_TOP_PERCENTILE;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[lo + 1] - sorted[lo]) * (at - lo);
}

test('an area\'s zone follows its density: fix first, watch, healthy', () => {
  assert.equal(zoneOf(FIX_FIRST_DENSITY), SKY_ZONE.FIX_FIRST);
  assert.equal(zoneOf(MESSY_TOP), SKY_ZONE.FIX_FIRST);
  assert.equal(zoneOf(WATCH_DENSITY), SKY_ZONE.WATCH);
  assert.equal(zoneOf(FIX_FIRST_DENSITY - EPS), SKY_ZONE.WATCH);
  assert.equal(zoneOf(WATCH_DENSITY - EPS), SKY_ZONE.HEALTHY);
  assert.equal(zoneOf(0), SKY_ZONE.HEALTHY);
});

test('the scale tops out at a high percentile of the densities, never below the floor', () => {
  assert.equal(SCALE_FLOOR, 2 * FIX_FIRST_DENSITY);
  assert.equal(densityTop(CLEAN.map((d, i) => area(`c${i}`, d))), SCALE_FLOOR);
  assert.ok(Math.abs(densityTop(spread()) - spreadPercentile()) < EPS);
  assert.ok(densityTop(spread()) < SPREAD_MAX);
  assert.equal(densityTop([]), SCALE_FLOOR);
});

test('with few areas, one runaway area is capped at twice the second densest', () => {
  assert.equal(OUTLIER_CAP, 2);
  const top = densityTop(BENCHMARK_LIKE.map((d, i) => area(`b${i}`, d)));
  assert.ok(Math.abs(top - BENCHMARK_TOP) < EPS, `${top}`);
});

test('a single area has no second to cap against: its own density, or the floor', () => {
  assert.equal(densityTop([area('only', MESSY_TOP)]), MESSY_TOP);
  assert.equal(densityTop([area('only', HALF_DENSITY)]), SCALE_FLOOR);
});

test('an empty fix-first zone closes in around the centre, and nothing is counted in it', () => {
  const scale = skyScale(CLEAN.map((d, i) => area(`c${i}`, d)));
  assert.equal(scale.fixFirst, EMPTY_FIX_FIRST);
  assert.deepEqual(scale.counts, { fixFirst: 0, watch: 0 });
  assert.ok(scale.watch > scale.fixFirst);
});

test('a zone that holds areas keeps its minimum room, however few they are', () => {
  const scale = skyScale([area('hot', HOT), area('warm', WARM), ...many('cool', COOL)]);
  assert.ok(scale.fixFirst >= MIN_FIX_FIRST - EPS, `${scale.fixFirst}`);
  assert.ok(scale.watch >= MIN_WATCH - EPS, `${scale.watch}`);
  assert.deepEqual(scale.counts, { fixFirst: 1, watch: 1 });
});

test('the rings follow content: more bubble area in a zone widens it', () => {
  const few = skyScale([...many('hot', HOT, 2), ...many('cool', COOL)]);
  const more = skyScale([...many('hot', HOT, MANY), ...many('cool', COOL)]);
  const bigger = skyScale([area('hot0', HOT, BIG_FILES), area('hot1', HOT, BIG_FILES), ...many('cool', COOL)]);
  assert.ok(more.fixFirst > few.fixFirst, `${more.fixFirst} vs ${few.fixFirst}`);
  assert.ok(bigger.fixFirst > few.fixFirst, `${bigger.fixFirst} vs ${few.fixFirst}`);
  assert.ok(more.fixFirst < more.watch);
  assert.equal(more.counts.fixFirst, MANY);
});

test('skyRings is the scale\'s rings and counts, without the top', () => {
  const areas = [area('hot', HOT), area('warm', WARM), area('cool', COOL)];
  const { fixFirst, watch, counts } = skyScale(areas);
  assert.deepEqual(skyRings(areas), { fixFirst, watch, counts });
});

test('every density lands inside its own zone\'s band', () => {
  const scale = skyScale([area('hot', HOT), area('warm', WARM), ...many('cool', COOL)]);
  const fix = [FIX_FIRST_DENSITY, HOT, scale.top, OUTLIER].map((d) => densityDistance(d, scale));
  const watch = [WATCH_DENSITY, WARM, FIX_FIRST_DENSITY - EPS].map((d) => densityDistance(d, scale));
  const healthy = [0, COOL, WATCH_DENSITY - EPS].map((d) => densityDistance(d, scale));
  assert.ok(fix.every((d) => d > 0 && d <= scale.fixFirst + EPS), `${fix}`);
  assert.ok(watch.every((d) => d >= scale.fixFirst - EPS && d <= scale.watch + EPS), `${watch}`);
  assert.ok(healthy.every((d) => d >= scale.watch - EPS && d < SKY_RIM), `${healthy}`);
});

test('denser areas sit closer to the centre; past the top they stop at the innermost distance', () => {
  const scale = skyScale([area('hot', HOT), area('warm', WARM), area('cool', COOL)]);
  const at = (d) => densityDistance(d, scale);
  assert.ok(at(HOT) < at(FIX_FIRST_DENSITY));
  assert.ok(at(FIX_FIRST_DENSITY) < at(WARM) && at(WARM) < at(WATCH_DENSITY));
  assert.ok(at(WATCH_DENSITY) < at(COOL) && at(COOL) < at(0));
  assert.equal(at(OUTLIER), at(scale.top));
});

test('a bubble grows with the square root of its files', () => {
  assert.ok(bubbleRadius(BIG_FILES) > bubbleRadius(FILES));
  assert.equal(bubbleRadius(-1), bubbleRadius(0));
});
