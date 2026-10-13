import { useState } from 'react';

/** The cross-fade between the latest view and a past run (drives --map-stage-fade in mapTimelapse.css). */
export const STAGE_FADE_MS = 300;

const STAGE_STYLE = { '--map-stage-fade': `${STAGE_FADE_MS}ms` };

const sameHistory = (a, b) => a.data === b.data && a.project === b.project;

/**
 * The time-lapse the past layer is drawn with, or null while it has none.
 * On a past run: the live one. Back on the latest: the one it last showed,
 * so the hidden view holds that run and does no new position or data work
 * (a jump to the latest, a refetch, a project switch). The layer, and what it
 * built, is kept while the history stays the same, so seeking again reuses
 * it; a new history or project drops it.
 */
function usePastTimelapse(timelapse) {
  const [held, setHeld] = useState(timelapse.past ? timelapse : null);
  if (timelapse.past) {
    if (held !== timelapse) setHeld(timelapse);
    return timelapse;
  }
  if (!held || sameHistory(held, timelapse)) return held;
  setHeld(null);
  return null;
}

/**
 * Two stacked layers: the latest view (always mounted, so its zoom and focus
 * survive playback) and the past-run view, drawn by `renderPast(timelapse)`
 * (mounted the first time a past run shows, then kept, hidden and holding its
 * run, so returning to the latest and seeking again does not rebuild it).
 * Switching cross-fades; reduced motion swaps at once (CSS). The hidden layer
 * takes no pointer events and is hidden from assistive tech, so the latest
 * view's info panel never shows through on a past run.
 */
export default function MapTimelapseStage({ timelapse, latest, renderPast }) {
  const { past } = timelapse;
  const pastTimelapse = usePastTimelapse(timelapse);
  return (
    <div className="map-stage" style={STAGE_STYLE}>
      <div className={`map-stage__layer${past ? ' is-hidden' : ''}`} aria-hidden={past || undefined}>{latest}</div>
      {pastTimelapse && (
        <div key={pastTimelapse.project} className={`map-stage__layer map-stage__layer--past${past ? '' : ' is-hidden'}`} aria-hidden={!past || undefined}>
          {renderPast(pastTimelapse)}
        </div>
      )}
    </div>
  );
}
