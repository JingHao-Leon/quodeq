import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { MAP_FRAMES } from '../mapVocab.js';
import { decodeTimelapse, NO_TIMELAPSE } from '../model/mapTimelapse.js';
import {
  PLAYBACK_ACTION, MOVE_MS, HOLD_MS, TIMELAPSE_STATUS, initialPlayback, playbackReducer, isPast,
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

function usePlaybackControls(dispatch) {
  return useMemo(() => ({
    toggle: () => dispatch({ type: PLAYBACK_ACTION.TOGGLE }),
    pause: () => dispatch({ type: PLAYBACK_ACTION.PAUSE }),
    first: () => dispatch({ type: PLAYBACK_ACTION.SEEK, position: 0 }),
    latest: () => dispatch({ type: PLAYBACK_ACTION.SEEK, position: Infinity }),
    seek: (position) => dispatch({ type: PLAYBACK_ACTION.SEEK, position }),
    step: (delta) => dispatch({ type: PLAYBACK_ACTION.STEP, delta }),
    setSpeed: (speed) => dispatch({ type: PLAYBACK_ACTION.SPEED, speed }),
  }), [dispatch]);
}

/**
 * The Map's time-lapse: every run of the history (fetched only while the
 * Circle Pack or Risk tab is on screen, local projects only) and the playback
 * state over it. `blocked` (a Dimensions filter on the Circle Pack) returns
 * to the latest run. Leaving the views pauses.
 * @param {{project: string, source: string, active: boolean, blocked?: boolean}} args
 */
export default function useMapTimelapse({ project, source, active, blocked = false }) {
  const api = useApi();
  const enabled = mapHistoryEnabled(project, source, active);
  const query = useQuery({ ...mapHistoryQuery({ api, project, source, active, frames: MAP_FRAMES.ALL }), select: decodeTimelapse });
  const data = query.data || NO_TIMELAPSE;
  const [state, dispatch] = useReducer(playbackReducer, data.runs.length, initialPlayback);
  useEffect(() => { dispatch({ type: PLAYBACK_ACTION.RESET, runCount: data.runs.length }); }, [data.runs.length, project]);
  usePlaybackGuard(state, dispatch, { active, blocked });
  usePlaybackClock(state, dispatch);
  const controls = usePlaybackControls(dispatch);
  const onSettled = useCallback((position) => dispatch({ type: PLAYBACK_ACTION.SETTLED, position }), []);
  const status = timelapseStatus(enabled, query);
  return {
    status, data, position: state.position, speed: state.speed,
    playing: state.playing && !blocked,
    past: status === TIMELAPSE_STATUS.READY && !blocked && isPast(state),
    moveMs: prefersReducedMotion() ? 0 : MOVE_MS / state.speed,
    controls, onSettled,
  };
}
