import { useCallback, useState } from 'react';
import { RiskView, RiskTimelapseView } from '../viz/index.js';
import MapTimelapseStage from './MapTimelapseStage.jsx';
import useSkyTimeline from '../hooks/useSkyTimeline.js';

/**
 * The selected area by name, shared by today's sky and the time-lapse; a new
 * project (resetKey) clears it. `initial` (an area opened from the Overview)
 * is selected when the tab opens on it.
 */
function useAreaSelection(resetKey, initial) {
  const [held, setHeld] = useState({ resetKey, name: initial || null });
  const onSelectName = useCallback((name) => setHeld({ resetKey, name }), [resetKey]);
  return { selectedName: held.resetKey === resetKey ? held.name : null, onSelectName };
}

/**
 * The Risk tab: today's sky, and the time-lapse sky when a past run is shown.
 * The time-lapse's latest run is today's sky, so going back to the latest run
 * the stage cross-fades to the same picture. Hidden, the past sky holds the
 * run it last showed, so today's run never costs it a sky. Both skies share
 * one selection by area name, so a selected area is followed over time. The
 * past sky's timeline lives here, warmed while the tab is on screen, so the
 * first seek into the past finds its run laid out (the stage only ever holds
 * the history in hand, so it is the same data).
 */
export default function MapRiskPanel({ risk, riskActions, view, timelapse }) {
  const { dark, showLabels, resetKey } = view;
  const timeline = useSkyTimeline(timelapse.data);
  const selection = useAreaSelection(resetKey, risk.initialArea);
  const latest = (
    <RiskView areaState={risk.areaState} dark={dark} showLabels={showLabels} resetKey={resetKey}
      onViewDetails={riskActions.onViewDetails} selection={selection} />
  );
  const renderPast = (held) => (
    <RiskTimelapseView timelapse={held} timeline={timeline} dark={dark} showLabels={showLabels} selection={selection} />
  );
  return <MapTimelapseStage timelapse={timelapse} latest={latest} renderPast={renderPast} />;
}
