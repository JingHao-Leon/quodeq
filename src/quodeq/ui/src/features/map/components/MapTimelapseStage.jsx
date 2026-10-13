import { useState } from 'react';

/** The cross-fade between the latest view and a past run (drives --map-stage-fade in mapTimelapse.css). */
export const STAGE_FADE_MS = 300;

const STAGE_STYLE = { '--map-stage-fade': `${STAGE_FADE_MS}ms` };

/**
 * True from the first render `on` is true, for as long as the caller lives:
 * a layer once shown stays mounted, so what it built (model, layouts) persists.
 */
function useShownOnce(on) {
  const [shown, setShown] = useState(on);
  if (on && !shown) setShown(true);
  return shown || on;
}

/**
 * Two stacked layers: the latest view (always mounted, so its zoom and focus
 * survive playback) and the past-run view (mounted the first time a past run
 * shows, then kept, hidden, so returning to the latest and seeking again does
 * not rebuild it). Switching cross-fades; reduced motion swaps at once (CSS).
 * The hidden layer takes no pointer events and is hidden from assistive tech,
 * so the latest view's info panel never shows through on a past run.
 */
export default function MapTimelapseStage({ past, latest, pastView }) {
  const mounted = useShownOnce(past);
  return (
    <div className="map-stage" style={STAGE_STYLE}>
      <div className={`map-stage__layer${past ? ' is-hidden' : ''}`} aria-hidden={past || undefined}>{latest}</div>
      {mounted && (
        <div className={`map-stage__layer map-stage__layer--past${past ? '' : ' is-hidden'}`} aria-hidden={!past || undefined}>
          {pastView}
        </div>
      )}
    </div>
  );
}
