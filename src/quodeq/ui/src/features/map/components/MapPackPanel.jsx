import { ZoomablePackView, TimelapsePackView } from '../viz/index.js';
import PackLegend from '../viz/components/PackLegend.jsx';
import MapTimelapseStage from './MapTimelapseStage.jsx';
import { ACTIVITY_SOURCE } from '../mapVocab.js';

/**
 * The Circle Pack tab: the latest pack, the time-lapse pack when a past run
 * is shown, and the legend. `view` carries the tree, colour mode, theme,
 * labels and navigation of the normal pack.
 */
export default function MapPackPanel({ view, pack, timelapse }) {
  const { fullTree, viewMode, dark, showLabels, resetKey, currentPath, explicitPath, onDrillDown, onFileClick } = view;
  const latest = (
    <ZoomablePackView
      node={fullTree} colorMode={viewMode} weights={pack.weights} editsByPath={pack.activity.editsByPath}
      dark={dark} onDrillDown={onDrillDown} onFileClick={onFileClick}
      showLabels={showLabels} resetKey={resetKey} currentPath={currentPath} autoOpen={!explicitPath}
    />
  );
  // Run and history come from the stage (held while hidden); zoom, theme and paint follow the page.
  const renderPast = (held) => (
    <TimelapsePackView
      timelapse={held} colorMode={viewMode} weights={pack.weights} dark={dark}
      showLabels={showLabels} currentPath={currentPath} onDrillDown={onDrillDown}
    />
  );
  return (
    <>
      <MapTimelapseStage timelapse={timelapse} latest={latest} renderPast={renderPast} />
      <PackLegend mode={viewMode} activityLoading={pack.loading} activitySource={pack.failed ? ACTIVITY_SOURCE.NONE : pack.activity.source} />
    </>
  );
}
