import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInIdleSlices, idleScheduler, FALLBACK_SLICE_BUDGET_MS } from './idleSlices.js';
import { createSkyTimeline } from './skyTimeline.js';

const PER_SLICE = 3;
const RUNS = 25;
const HALF = 0.5;

/** A scheduler the test drives by hand: slices run only when `next()` is called. */
function manualScheduler() {
  const queue = new Map();
  let id = 0;
  return {
    schedule: (fn) => { id += 1; queue.set(id, fn); return id; },
    cancel: (handle) => { queue.delete(handle); },
    pending: () => queue.size,
    next: (deadline) => {
      const [handle, fn] = queue.entries().next().value;
      queue.delete(handle);
      fn(deadline);
    },
  };
}

function countingWork(total) {
  let done = 0;
  const step = () => {
    if (done >= total) return false;
    done += 1;
    return true;
  };
  return { step, done: () => done };
}

function drain(scheduler, onSlice) {
  while (scheduler.pending()) onSlice(() => scheduler.next());
}

test('the work runs in slices of at most a few steps until none is left', () => {
  const scheduler = manualScheduler();
  const work = countingWork(RUNS);
  runInIdleSlices(work.step, { perSlice: PER_SLICE, scheduler });
  const sizes = [];
  drain(scheduler, (runSlice) => { const before = work.done(); runSlice(); sizes.push(work.done() - before); });
  assert.equal(work.done(), RUNS);
  assert.ok(sizes.every((n) => n <= PER_SLICE), `${sizes}`);
  assert.equal(scheduler.pending(), 0);
});

test('a slice stops early when the idle deadline has no time left', () => {
  const scheduler = manualScheduler();
  const work = countingWork(RUNS);
  runInIdleSlices(work.step, { perSlice: PER_SLICE, scheduler });
  scheduler.next({ timeRemaining: () => 0 });
  assert.equal(work.done(), 1);
  assert.equal(scheduler.pending(), 1);
});

test('stopping cancels the pending slice and no later step runs', () => {
  const scheduler = manualScheduler();
  const work = countingWork(RUNS);
  const stop = runInIdleSlices(work.step, { perSlice: PER_SLICE, scheduler });
  scheduler.next();
  stop();
  assert.equal(scheduler.pending(), 0);
  assert.equal(work.done(), PER_SLICE);
});

test('a slice already running when stopped does not schedule another', () => {
  const scheduler = manualScheduler();
  let stop = null;
  let steps = 0;
  stop = runInIdleSlices(() => { steps += 1; stop(); return true; }, { perSlice: PER_SLICE, scheduler });
  scheduler.next();
  assert.equal(steps, 1);
  assert.equal(scheduler.pending(), 0);
});

test('warming a sky timeline in slices settles every run, a few runs per slice', () => {
  const area = (name, files, density) => ({ name, kind: 'watch', density, layers: [], dots: [], stats: { files, violations: 0, compliance: 0, weight: 0, critical: 0, major: 0 } });
  const sets = Array.from({ length: RUNS }, (_, k) => ({ areas: [area('alpha', 8 + k, HALF), area('beta', 6, k / RUNS)], average: 1 }));
  const tl = createSkyTimeline((k) => sets[k], sets.map((_, k) => ({ day: `run-${k}` })));
  const scheduler = manualScheduler();
  runInIdleSlices(tl.warmStep, { perSlice: PER_SLICE, scheduler });
  const sizes = [];
  drain(scheduler, (runSlice) => {
    const { summarized, settled } = tl.progress();
    runSlice();
    const after = tl.progress();
    sizes.push(after.summarized - summarized + after.settled - settled);
  });
  assert.deepEqual(tl.progress(), { summarized: RUNS, settled: RUNS, total: RUNS });
  assert.ok(Math.max(...sizes) <= PER_SLICE, `${sizes}`);
});

test('the idle scheduler falls back to a timer where idle callbacks are missing', () => {
  const calls = [];
  const fallback = idleScheduler({ setTimeout: (fn, ms) => { calls.push(ms); return fn; }, clearTimeout: () => {} });
  assert.equal(typeof fallback.schedule(() => {}), 'function');
  assert.equal(calls.length, 1);
  const idle = idleScheduler({ requestIdleCallback: () => 'idle-handle', cancelIdleCallback: () => {} });
  assert.equal(idle.schedule(() => {}), 'idle-handle');
});

test('a host with idle callbacks but no way to cancel them gets the timer, never a half pair', () => {
  const timers = [];
  const host = { requestIdleCallback: () => 'idle-handle', setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {} };
  const scheduler = idleScheduler(host);
  assert.equal(scheduler.schedule(() => {}), 1);
  assert.doesNotThrow(() => scheduler.cancel(1));
});

test('the timer fallback hands each slice a deadline that runs out after its budget', () => {
  let clock = 0;
  const timers = [];
  const host = { performance: { now: () => clock }, setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {} };
  let deadline = null;
  idleScheduler(host).schedule((d) => { deadline = d; });
  timers[0]();
  assert.equal(deadline.timeRemaining(), FALLBACK_SLICE_BUDGET_MS);
  clock += FALLBACK_SLICE_BUDGET_MS;
  assert.equal(deadline.timeRemaining(), 0);
});
