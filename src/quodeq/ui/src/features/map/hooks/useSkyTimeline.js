import { useEffect, useMemo } from 'react';
import { createSkyTimeline } from '../viz/core/skyTimeline.js';
import { runInIdleSlices } from '../viz/core/idleSlices.js';
import { areaSetAt } from '../model/mapAreas.js';

/** Fewer runs than this leave no past run to seek to, so nothing to warm. */
const MIN_RUNS_TO_WARM = 2;

/**
 * The Risk time-lapse sky of this history, shared by the Risk tab's layers.
 * While mounted (the Risk tab is on screen) it warms the sky in idle slices
 * from the moment the history is in, a few runs per slice: every run read,
 * then every run settled, so a far seek finds its run ready instead of
 * settling the whole chain in one long task. Leaving the tab (unmount) or a
 * new history stops the warm-up of the old one.
 * @param {object} data decodeTimelapse output (NO_TIMELAPSE while loading)
 * @returns {ReturnType<typeof createSkyTimeline>}
 */
export default function useSkyTimeline(data) {
  const timeline = useMemo(() => createSkyTimeline((k) => areaSetAt(data, k), data.runs), [data]);
  const warm = data.runs.length >= MIN_RUNS_TO_WARM;
  useEffect(() => (warm ? runInIdleSlices(timeline.warmStep) : undefined), [timeline, warm]);
  return timeline;
}
