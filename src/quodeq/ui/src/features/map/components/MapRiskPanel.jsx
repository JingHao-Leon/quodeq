import { RiskView, RiskTimelapseView } from '../viz/index.js';
import MapTimelapseStage from './MapTimelapseStage.jsx';

/**
 * The Risk tab: today's sky, and the time-lapse sky when a past run is shown.
 * Back on the latest run the stage cross-fades to today's sky, whose scale
 * top is today's alone, so the last played run hands over without a jump.
 */
export default function MapRiskPanel({ risk, riskActions, view, timelapse }) {
  const { dark, showLabels, resetKey } = view;
  const latest = (
    <RiskView areaState={risk.areaState} dark={dark} showLabels={showLabels} resetKey={resetKey}
      onViewDetails={riskActions.onViewDetails} onShowInPack={riskActions.onShowInPack} />
  );
  const pastView = <RiskTimelapseView timelapse={timelapse} dark={dark} showLabels={showLabels} />;
  return <MapTimelapseStage past={timelapse.past} latest={latest} pastView={pastView} />;
}
