import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOB_SCALE, LOG_POSITIONS, inputRange, toPosition, fromPosition, trackPercent } from './knobScale.js';

const LOG = { min: 0.05, max: 25, step: 0.05, scale: KNOB_SCALE.LOG };
const LINEAR = { min: 0, max: 10, step: 0.5 };

test('a log knob runs its input over positions, a linear one over its own range', () => {
  assert.deepEqual(inputRange(LOG), { min: 0, max: LOG_POSITIONS, step: 1 });
  assert.deepEqual(inputRange(LINEAR), { min: 0, max: 10, step: 0.5 });
});

test('a log knob reaches both ends of its range', () => {
  assert.equal(fromPosition(LOG, 0), 0.05);
  assert.equal(fromPosition(LOG, LOG_POSITIONS), 25);
});

test('the Q2 defaults survive a round trip through the slider', () => {
  for (const weight of [0.15, 2, 7.5]) assert.equal(fromPosition(LOG, toPosition(LOG, weight)), weight);
});

test('the log scale gives the minor weight real travel', () => {
  // 0.05 to 0.5 takes over a third of the track; on a linear 0-25 track it took 2%.
  assert.ok(trackPercent(LOG, 0.5) > 35);
});

test('log values keep two significant figures', () => {
  const values = Array.from({ length: LOG_POSITIONS + 1 }, (_, p) => fromPosition(LOG, p));
  assert.ok(values.every((v) => Number(v.toPrecision(2)) === v));
});

test('a linear knob passes values straight through', () => {
  assert.equal(toPosition(LINEAR, 2.5), 2.5);
  assert.equal(fromPosition(LINEAR, 2.5), 2.5);
  assert.equal(trackPercent(LINEAR, 2.5), 25);
});
