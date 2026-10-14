import { useCallback, useState } from 'react';
import { ZoomablePackView, TimelapsePackView } from '../viz/index.js';
import PackLegend from '../viz/components/PackLegend.jsx';
import MapTimelapseStage from './MapTimelapseStage.jsx';
import { ACTIVITY_SOURCE } from '../mapVocab.js';

/** The selected file by path, shared by today's pack and the time-lapse (so it survives the hand-over); a new project clears it. */
function useFileSelection(resetKey) {
  const [held, setHeld] = useState({ resetKey, path: null });
  const onSelect = useCallback((path) => setHeld({ resetKey, path }), [resetKey]);
  return { path: held.resetKey === resetKey ? held.path : null, onSelect };
}

/**
 * The Circle Pack tab: the latest pack, the time-lapse pack when a past run
 * is shown, and the legend. `view` carries the tree, colour mode, theme,
 * labels and navigation of the normal pack.
 */
export default function MapPackPanel({ view, pack, timelapse }) {
  const { fullTree, viewMode, dark, showLabels, resetKey, currentPath, onDrillDown, onFileClick } = view;
  const selection = useFileSelection(resetKey);
  const latest = (
    <ZoomablePackView
      node={fullTree} colorMode={viewMode} weights={pack.weights} editsByPath={pack.activity.editsByPath}
      dark={dark} onDrillDown={onDrillDown} onFileClick={onFileClick}
      showLabels={showLabels} resetKey={resetKey} currentPath={currentPath} selection={selection}
    />
  );
  // Run and history come from the stage (held while hidden); zoom, theme and paint follow the page.
  const renderPast = (held) => (
    <TimelapsePackView
      timelapse={held} colorMode={viewMode} weights={pack.weights} dark={dark}
      showLabels={showLabels} currentPath={currentPath} onDrillDown={onDrillDown} selection={selection}
    />
  );
  return (
    <>
      <MapTimelapseStage timelapse={timelapse} latest={latest} renderPast={renderPast} />
      <PackLegend mode={viewMode} activityLoading={pack.loading} activitySource={pack.failed ? ACTIVITY_SOURCE.NONE : pack.activity.source} />
    </>
  );
}
