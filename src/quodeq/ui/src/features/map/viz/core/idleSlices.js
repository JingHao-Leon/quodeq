/** Steps per idle slice when warming the Risk time-lapse: a few runs, never a long task. */
export const WARM_STEPS_PER_SLICE = 4;
/** Delay of the timer that stands in for an idle callback where the browser has none. */
const FALLBACK_DELAY_MS = 16;
/**
 * The timer's stand-in for an idle deadline: a slice stops after this long.
 * WebKit (the desktop app) has no idle callbacks, and without a deadline a
 * slice holding the history build and run 0's full layout could run long.
 */
export const FALLBACK_SLICE_BUDGET_MS = 8;

/** A deadline like an idle callback's: time left of a budget that starts now. */
function syntheticDeadline(budgetMs, now) {
  const end = now() + budgetMs;
  return { timeRemaining: () => Math.max(0, end - now()) };
}

/**
 * Idle callbacks where the host has both halves of the pair, a short timer
 * with a synthetic deadline otherwise.
 * @param {object} [host] the global object (injectable for tests)
 * @returns {{schedule: function(function): *, cancel: function(*): void}}
 */
export function idleScheduler(host = globalThis) {
  if (typeof host.requestIdleCallback === 'function' && typeof host.cancelIdleCallback === 'function') {
    return { schedule: host.requestIdleCallback.bind(host), cancel: host.cancelIdleCallback.bind(host) };
  }
  const setTimer = host.setTimeout.bind(host);
  const now = () => (host.performance || performance).now();
  return {
    schedule: (fn) => setTimer(() => fn(syntheticDeadline(FALLBACK_SLICE_BUDGET_MS, now)), FALLBACK_DELAY_MS),
    cancel: host.clearTimeout.bind(host),
  };
}

const hasTimeLeft = (deadline) => !deadline || deadline.timeRemaining() > 0;

/**
 * Runs `step` in small slices while the page is idle, until it reports there
 * is nothing left (returns false) or the returned stop is called. A slice
 * runs at most `perSlice` steps, fewer when the idle deadline runs out; the
 * first step of a slice always runs, so the work always moves on.
 * @param {function(): boolean} step one unit of work; false when none was left
 * @param {{perSlice?: number, scheduler?: {schedule: function, cancel: function}}} [options]
 * @returns {function(): void} stop: cancels the pending slice and every later one
 */
export function runInIdleSlices(step, { perSlice = WARM_STEPS_PER_SLICE, scheduler = idleScheduler() } = {}) {
  let stopped = false;
  let handle = null;
  const slice = (deadline) => {
    handle = null;
    for (let done = 0; !stopped && done < perSlice; done++) {
      if (done && !hasTimeLeft(deadline)) break;
      if (!step()) return;
    }
    if (!stopped) handle = scheduler.schedule(slice);
  };
  handle = scheduler.schedule(slice);
  return () => {
    stopped = true;
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
  };
}
