/** Steps per idle slice when warming the Risk time-lapse: a few runs, never a long task. */
export const WARM_STEPS_PER_SLICE = 4;
/** Delay of the timer that stands in for an idle callback where the browser has none. */
const FALLBACK_DELAY_MS = 16;

/**
 * Idle callbacks where the host has them, a short timer otherwise.
 * @param {object} [host] the global object (injectable for tests)
 * @returns {{schedule: function(function): *, cancel: function(*): void}}
 */
export function idleScheduler(host = globalThis) {
  if (typeof host.requestIdleCallback === 'function') {
    return { schedule: host.requestIdleCallback.bind(host), cancel: host.cancelIdleCallback.bind(host) };
  }
  const setTimer = host.setTimeout.bind(host);
  return { schedule: (fn) => setTimer(fn, FALLBACK_DELAY_MS), cancel: host.clearTimeout.bind(host) };
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
