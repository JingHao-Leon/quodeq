/** Playback speeds the bar offers, slowest first. */
const DEFAULT_SPEED = 1;
const MAX_SPEED = 4;
export const PLAYBACK_SPEEDS = Object.freeze([DEFAULT_SPEED, 2, MAX_SPEED]);
/** How long a run-to-run move takes at 1x: gentle enough to follow a folder. */
export const MOVE_MS = 900;
/** How long a settled run stays on screen at 1x before the next one. */
export const HOLD_MS = 500;
/** Where the history behind the bar stands. */
export const TIMELAPSE_STATUS = Object.freeze({ OFF: 'off', LOADING: 'loading', FAILED: 'failed', READY: 'ready' });
export const PLAYBACK_ACTION = Object.freeze({
  RESET: 'reset', TOGGLE: 'toggle', PAUSE: 'pause', SEEK: 'seek', STEP: 'step', TICK: 'tick', SPEED: 'speed', SETTLED: 'settled',
});
const NOT_SETTLED = -1;

/**
 * A history of `runCount` runs, on its latest run and paused.
 * @returns {{runCount: number, position: number, playing: boolean, speed: number, settled: number}}
 */
export function initialPlayback(runCount, speed = DEFAULT_SPEED) {
  return { runCount, position: Math.max(0, runCount - 1), playing: false, speed, settled: NOT_SETTLED };
}

const lastRun = (s) => Math.max(0, s.runCount - 1);
const clampRun = (s, k) => Math.min(lastRun(s), Math.max(0, k));

/** True on any run but the latest (the latest shows the normal Map). */
export function isPast(state) {
  return state.position < lastRun(state);
}

function toggle(s) {
  if (s.playing) return { ...s, playing: false };
  if (s.runCount < 2) return s;
  const position = s.position >= lastRun(s) ? 0 : s.position;
  return { ...s, playing: true, position, settled: position === s.position ? s.settled : NOT_SETTLED };
}

function tick(s) {
  if (!s.playing || s.settled !== s.position) return s;
  const position = s.position + 1;
  return { ...s, position, playing: position < lastRun(s) };
}

const HANDLERS = {
  [PLAYBACK_ACTION.RESET]: (s, a) => initialPlayback(a.runCount, s.speed),
  [PLAYBACK_ACTION.TOGGLE]: toggle,
  [PLAYBACK_ACTION.PAUSE]: (s) => (s.playing ? { ...s, playing: false } : s),
  [PLAYBACK_ACTION.SEEK]: (s, a) => ({ ...s, position: clampRun(s, a.position), playing: false }),
  [PLAYBACK_ACTION.STEP]: (s, a) => ({ ...s, position: clampRun(s, s.position + a.delta), playing: false }),
  [PLAYBACK_ACTION.TICK]: tick,
  [PLAYBACK_ACTION.SPEED]: (s, a) => (PLAYBACK_SPEEDS.includes(a.speed) ? { ...s, speed: a.speed } : s),
  [PLAYBACK_ACTION.SETTLED]: (s, a) => (s.settled === a.position ? s : { ...s, settled: a.position }),
};

/** The playback state after `action` (a PLAYBACK_ACTION with its fields). */
export function playbackReducer(state, action) {
  const handle = HANDLERS[action.type];
  return handle ? handle(state, action) : state;
}
