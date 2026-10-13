import { RiskView, RiskTimelapseView } from '../viz/index.js';
import MapTimelapseStage from './MapTimelapseStage.jsx';

/**
 * The Risk tab: today's sky, and the time-lapse sky when a past run is shown.
 * Back on the latest run the stage cross-fades to today's sky, which has its
 * own scale top: its rings and bubbles can sit elsewhere than the last played
 * run's, and the change shows as a fade, not a jump. Hidden, the past sky
 * holds the run it last showed, so today's run never costs it a sky.
 */
export default function MapRiskPanel({ risk, riskActions, view, timelapse }) {
  const { dark, showLabels, resetKey } = view;
  const latest = (
    <RiskView areaState={risk.areaState} dark={dark} showLabels={showLabels} resetKey={resetKey}
      onViewDetails={riskActions.onViewDetails} onShowInPack={riskActions.onShowInPack} />
  );
  const renderPast = (held) => <RiskTimelapseView timelapse={held} dark={dark} showLabels={showLabels} />;
  return <MapTimelapseStage timelapse={timelapse} latest={latest} renderPast={renderPast} />;
}
