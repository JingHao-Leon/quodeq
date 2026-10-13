import { RiskView, RiskTimelapseView } from '../viz/index.js';
import MapTimelapseStage from './MapTimelapseStage.jsx';
import useSkyTimeline from '../hooks/useSkyTimeline.js';

/**
 * The Risk tab: today's sky, and the time-lapse sky when a past run is shown.
 * Back on the latest run the stage cross-fades to today's sky, which has its
 * own scale top: its rings and bubbles can sit elsewhere than the last played
 * run's, and the change shows as a fade, not a jump. Hidden, the past sky
 * holds the run it last showed, so today's run never costs it a sky. The
 * past sky's timeline lives here, warmed while the tab is on screen, so the
 * first seek into the past finds its run settled (the stage only ever holds
 * the history in hand, so it is the same data).
 */
export default function MapRiskPanel({ risk, riskActions, view, timelapse }) {
  const { dark, showLabels, resetKey } = view;
  const timeline = useSkyTimeline(timelapse.data);
  const latest = (
    <RiskView areaState={risk.areaState} dark={dark} showLabels={showLabels} resetKey={resetKey}
      onViewDetails={riskActions.onViewDetails} onShowInPack={riskActions.onShowInPack} />
  );
  const renderPast = (held) => <RiskTimelapseView timelapse={held} timeline={timeline} dark={dark} showLabels={showLabels} />;
  return <MapTimelapseStage timelapse={timelapse} latest={latest} renderPast={renderPast} />;
}
