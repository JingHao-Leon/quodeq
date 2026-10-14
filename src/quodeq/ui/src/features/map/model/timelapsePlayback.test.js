import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPlayback, playbackReducer, isPast, showsTimelapse, PLAYBACK_ACTION as A } from './timelapsePlayback.js';

const run = (state, ...actions) => actions.reduce(playbackReducer, state);

test('a history opens on its latest run, paused', () => {
  const s = initialPlayback(5);
  assert.deepEqual([s.position, s.playing, isPast(s)], [4, false, false]);
});

test('play from the latest restarts at the first run; play again pauses', () => {
  const s = run(initialPlayback(5), { type: A.TOGGLE });
  assert.deepEqual([s.position, s.playing, isPast(s)], [0, true, true]);
  assert.equal(run(s, { type: A.TOGGLE }).playing, false);
});

test('a tick waits for the view to settle, then steps; the latest run stops playback', () => {
  let s = run(initialPlayback(3), { type: A.TOGGLE }, { type: A.TICK });
  assert.equal(s.position, 0);
  s = run(s, { type: A.SETTLED, position: 0 }, { type: A.TICK });
  assert.deepEqual([s.position, s.playing], [1, true]);
  s = run(s, { type: A.SETTLED, position: 1 }, { type: A.TICK });
  assert.deepEqual([s.position, s.playing], [2, false]);
});

test('seek and step clamp to the history and pause', () => {
  const playing = run(initialPlayback(4), { type: A.TOGGLE });
  assert.deepEqual([run(playing, { type: A.SEEK, position: 99 }).position, run(playing, { type: A.SEEK, position: Infinity }).playing], [3, false]);
  assert.equal(run(playing, { type: A.STEP, delta: -1 }).position, 0);
});

test('only offered speeds are taken, and a reset keeps the speed', () => {
  const fast = run(initialPlayback(4), { type: A.SPEED, speed: 4 }, { type: A.SPEED, speed: 3 });
  assert.equal(fast.speed, 4);
  assert.deepEqual([run(fast, { type: A.RESET, runCount: 6 }).position, run(fast, { type: A.RESET, runCount: 6 }).speed], [5, 4]);
});

test('a single run cannot play', () => {
  assert.equal(run(initialPlayback(1), { type: A.TOGGLE }).playing, false);
});

test('a reset names whose history it is and keeps the speed', () => {
  const s = run(initialPlayback(3, 2, 'a'), { type: A.SEEK, position: 0 }, { type: A.RESET, runCount: 5, owner: 'b' });
  assert.deepEqual([s.owner, s.position, s.speed], ['b', 4, 2]);
});

test('playing into the latest run keeps the time-lapse on screen until that move settles', () => {
  let s = run(initialPlayback(3), { type: A.TOGGLE }, { type: A.SETTLED, position: 0 }, { type: A.TICK }, { type: A.SETTLED, position: 1 }, { type: A.TICK });
  assert.deepEqual([s.position, isPast(s), showsTimelapse(s)], [2, false, true]);
  s = run(s, { type: A.SETTLED, position: 2 });
  assert.equal(showsTimelapse(s), false);
});

test('a jump to the latest run hands over to the Map at once; a step in waits like playback', () => {
  const past = run(initialPlayback(3), { type: A.SEEK, position: 1 });
  assert.equal(showsTimelapse(run(past, { type: A.SEEK, position: Infinity })), false);
  assert.equal(showsTimelapse(run(past, { type: A.STEP, delta: 1 })), true);
});
