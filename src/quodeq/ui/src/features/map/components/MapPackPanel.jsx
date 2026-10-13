import { ZoomablePackView, TimelapsePackView } from '../viz/index.js';
import PackLegend from '../viz/components/PackLegend.jsx';
import MapTimelapseStage from './MapTimelapseStage.jsx';
import { ACTIVITY_SOURCE } from '../mapVocab.js';

/**
 * The Circle Pack tab: the latest pack, the time-lapse pack when a past run
 * is shown, and the legend. `view` carries the tree, colour mode, theme,
 * labels and navigation of the normal pack.
 */
export default function MapPackPanel({ view, pack, timelapse, past }) {
  const { fullTree, viewMode, dark, showLabels, resetKey, currentPath, explicitPath, onDrillDown, onFileClick } = view;
  const latest = (
    <ZoomablePackView
      node={fullTree} colorMode={viewMode} weights={pack.weights} editsByPath={pack.activity.editsByPath}
      dark={dark} onDrillDown={onDrillDown} onFileClick={onFileClick}
      showLabels={showLabels} resetKey={resetKey} currentPath={currentPath} autoOpen={!explicitPath}
    />
  );
  const pastView = (
    <TimelapsePackView
      timelapse={timelapse} colorMode={viewMode} weights={pack.weights} dark={dark}
      showLabels={showLabels} currentPath={currentPath} onDrillDown={onDrillDown}
    />
  );
  return (
    <>
      <MapTimelapseStage past={past} latest={latest} pastView={pastView} />
      <PackLegend mode={viewMode} activityLoading={pack.loading} activitySource={pack.failed ? ACTIVITY_SOURCE.NONE : pack.activity.source} />
    </>
  );
}
