import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { MAP_FRAMES } from '../mapVocab.js';
import { decodeTimelapse, NO_TIMELAPSE } from '../model/mapTimelapse.js';
import { framesByPeriod, periodIndexOf } from '../model/timelapsePeriods.js';
import { GRANULARITY } from '../../../utils/granularity.js';
import {
  PLAYBACK_ACTION, MOVE_MS, HOLD_MS, TIMELAPSE_STATUS, initialPlayback, playbackReducer, isPast, showsTimelapse,
} from '../model/timelapsePlayback.js';
import { mapHistoryQuery, mapHistoryEnabled } from './mapHistoryQuery.js';
import { prefersReducedMotion } from '../viz/core/packTween.js';

function timelapseStatus(enabled, query) {
  if (!enabled) return TIMELAPSE_STATUS.OFF;
  if (query.isError) return TIMELAPSE_STATUS.FAILED;
  return query.data ? TIMELAPSE_STATUS.READY : TIMELAPSE_STATUS.LOADING;
}

/** Advance one run once the view settled on the current one and the hold passed. */
function usePlaybackClock(state, dispatch) {
  const { playing, settled, position, speed } = state;
  useEffect(() => {
    if (!playing || settled !== position) return undefined;
    const id = setTimeout(() => dispatch({ type: PLAYBACK_ACTION.TICK }), HOLD_MS / speed);
    return () => clearTimeout(id);
  }, [playing, settled, position, speed, dispatch]);
}

/**
 * Playback never outlives its view: leaving the Circle Pack / Risk tabs pauses,
 * and a blocking filter returns to the latest run and keeps it there (also if
 * play is pressed meanwhile), so it never sits "playing" with nothing advancing.
 */
function usePlaybackGuard(state, dispatch, { active, blocked }) {
  const { playing } = state;
  const past = isPast(state);
  useEffect(() => {
    if (blocked && (playing || past)) dispatch({ type: PLAYBACK_ACTION.SEEK, position: Infinity });
    else if (!blocked && !active && playing) dispatch({ type: PLAYBACK_ACTION.PAUSE });
  }, [active, blocked, playing, past, dispatch]);
}

/**
 * The playback state for the history in hand. A switch to another project (or
 * a history of another length) renders once before the reset lands; that
 * render shows the new history's latest run, paused, never the old position.
 */
function ownState(state, project, runCount) {
  return state.owner === project && state.runCount === runCount ? state : initialPlayback(runCount, state.speed, project);
}

/** The run on screen: never past the end of the history, always the latest while blocked. */
function shownPosition(state, runCount, blocked) {
  const latest = Math.max(0, runCount - 1);
  return blocked ? latest : Math.min(state.position, latest);
}

function usePlaybackControls(dispatch) {
  return useMemo(() => ({
    toggle: () => dispatch({ type: PLAYBACK_ACTION.TOGGLE }),
    first: () => dispatch({ type: PLAYBACK_ACTION.SEEK, position: 0 }),
    latest: () => dispatch({ type: PLAYBACK_ACTION.SEEK, position: Infinity }),
    seek: (position) => dispatch({ type: PLAYBACK_ACTION.SEEK, position }),
    step: (delta) => dispatch({ type: PLAYBACK_ACTION.STEP, delta }),
    setSpeed: (speed) => dispatch({ type: PLAYBACK_ACTION.SPEED, speed }),
  }), [dispatch]);
}

/**
 * The period the time-lapse plays by: the app's history grouping (the
 * Overview's day, week or month, one setting for both). Picking another one
 * keeps the day on screen: the playback resets onto the period that holds it.
 */
function usePeriod({ granularity, onGranularityChange, shown }) {
  const keepDay = useRef(null);
  const period = granularity || GRANULARITY.DAY;
  const setPeriod = useCallback((next) => {
    keepDay.current = shown.current.frames?.runs[shown.current.frame]?.day ?? null;
    onGranularityChange?.(next);
  }, [onGranularityChange, shown]);
  const takeKeptDay = useCallback(() => {
    const day = keepDay.current;
    keepDay.current = null;
    return day;
  }, []);
  return { period, setPeriod, takeKeptDay };
}

/**
 * The Map's time-lapse: every run of the history (fetched only while the
 * Circle Pack or Risk tab is on screen, local projects only) and the playback
 * state over it, played frame by frame: every day, or the last run of each
 * week or month (`frames`: the bar's runs, the frame shown, the period and
 * its setter). The views get the history itself and the run of the frame
 * shown (`position`), so a change of period reuses their layout and only
 * moves them. `blocked` (a Dimensions filter on the Circle Pack) returns to
 * the latest run; a `selection` (the Risk tab's, riskSelection.js) plays the
 * history measured over those findings. Leaving the views pauses.
 * `granularity` and `onGranularityChange` are the app's history grouping
 * (the Overview's).
 * @param {{project: string, source: string, active: boolean, blocked?: boolean, selection?: object|null, granularity?: string, onGranularityChange?: Function}} args
 */
export default function useMapTimelapse({ project, source, active, blocked = false, selection = null, granularity, onGranularityChange }) {
  const api = useApi();
  const enabled = mapHistoryEnabled(project, active);
  const query = useQuery({ ...mapHistoryQuery({ api, project, source, active, frames: MAP_FRAMES.ALL, selection }), select: decodeTimelapse });
  const decoded = query.data || NO_TIMELAPSE;
  const [state, dispatch] = useReducer(playbackReducer, decoded.runs.length, (runCount) => initialPlayback(runCount, undefined, project));
  const shown = useRef({ frames: null, frame: state.position });
  const { period, setPeriod, takeKeptDay } = usePeriod({ granularity, onGranularityChange, shown });
  const frames = useMemo(() => framesByPeriod(decoded.runs, period), [decoded, period]);
  // The frames read when the playback resets; a refetch of the same history keeps the playback, so only
  // the frame count, the project or the period trigger a reset.
  const latestFrames = useRef(frames);
  latestFrames.current = frames;
  const frameCount = frames.runs.length;
  useEffect(() => {
    const day = takeKeptDay();
    const position = day === null ? undefined : periodIndexOf(latestFrames.current.runs, day);
    dispatch({ type: PLAYBACK_ACTION.RESET, runCount: frameCount, owner: project, position });
  }, [frameCount, project, period, takeKeptDay]);
  usePlaybackGuard(state, dispatch, { active, blocked });
  usePlaybackClock(state, dispatch);
  const controls = usePlaybackControls(dispatch);
  // The views settle on a run of the history; the playback counts frames.
  const onSettled = useCallback((run) => dispatch({ type: PLAYBACK_ACTION.SETTLED, position: frames.ends.indexOf(run) }), [frames]);
  const status = timelapseStatus(enabled, query);
  const own = ownState(state, project, frames.runs.length);
  const frame = shownPosition(own, frames.runs.length, blocked);
  shown.current = { frames, frame };
  return {
    status, data: decoded, project,
    position: frames.ends[frame] ?? Math.max(0, decoded.runs.length - 1),
    nextPosition: frames.ends[frame + 1] ?? null,
    frames: { runs: frames.runs, position: frame, period, setPeriod },
    speed: state.speed,
    playing: own.playing && !blocked,
    past: status === TIMELAPSE_STATUS.READY && !blocked && (frame < frames.runs.length - 1 || showsTimelapse(own)),
    moveMs: prefersReducedMotion() ? 0 : MOVE_MS / state.speed,
    controls, onSettled,
  };
}
