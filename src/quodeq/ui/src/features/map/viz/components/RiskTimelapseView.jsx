import { useCallback, useMemo, useRef, useState } from 'react';
import SkyCanvas from './SkyCanvas.jsx';
import RiskLegend from './RiskLegend.jsx';
import RiskTooltip from './RiskTooltip.jsx';
import { WRAPPER_STYLE } from './canvasLayer.js';
import { riskLabelText } from './riskAreaInfo.js';
import { useRunTransition } from './useRunTransition.js';
import { timelapseNoteText } from './timelapseNote.js';
import { createSkyTimeline, lerpSkyNodes } from '../core/skyTimeline.js';
import { TRANSITION } from '../core/timelapseScene.js';
import { dayDate } from '../core/timelapseBarModel.js';
import { clampTooltipToBox } from '../core/tooltipPlacement.js';
import { areaSetAt } from '../../model/mapAreas.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { t } from '../../../../strings/index.js';

const NOTHING = () => {};
/** Between runs the sky only moves: bubbles tween by name, there is no cross-fade. */
const alwaysMove = () => TRANSITION.MOVE;

/**
 * Bubble positions aligned with the target run's areas: tweened from the run
 * before while moving, the run's own once settled. Memoised on the view, so a
 * hover render hands SkyCanvas the same array and the static sky stays put.
 */
function useViewNodes(view) {
  return useMemo(() => {
    if (!view) return null;
    const { areas, nodes } = view.to.state;
    const from = view.from?.state.nodes;
    if (from?.size) return lerpSkyNodes(areas, from, nodes, view.t);
    return areas.map((a) => nodes.get(a.name));
  }, [view]);
}

/** Hover with its clamped tooltip box; play drops it, so a pause never brings back the area hovered before play. */
function useTimelapseHover(containerRef, playing) {
  const [hover, setHover] = useState(null);
  if (playing && hover !== null) setHover(null);
  const onHover = useCallback((h) => {
    const el = containerRef.current;
    setHover(h && { ...h, pos: clampTooltipToBox(h.x, h.y, el?.offsetWidth, el?.offsetHeight) });
  }, [containerRef]);
  return [playing ? null : hover, playing ? NOTHING : onHover];
}

/**
 * The Risk sky on a past run (plan Decision 11): every area that is ever a
 * bubble, dotted where it has no file; bubbles drift from run to run under the
 * history's rings, which stay put while the runs play. Playing: a click
 * pauses. Paused: hover shows the run's numbers (or since when a dotted area
 * is gone); there is no selection, since View Details acts on today's data.
 */
export default function RiskTimelapseView({ timelapse, dark, showLabels }) {
  const { data, position, playing, moveMs, onSettled, controls } = timelapse;
  const timeline = useMemo(() => createSkyTimeline((k) => areaSetAt(data, k), data.runs), [data]);
  const load = useCallback((k) => timeline.sceneAt(k), [timeline]);
  const view = useRunTransition({ target: position, load, kindOf: alwaysMove, durationMs: moveMs, onSettled });
  const nodes = useViewNodes(view);
  const containerRef = useRef(null);
  const [hover, onHover] = useTimelapseHover(containerRef, playing);
  const onSelect = useCallback(() => { if (playing) controls.pause(); }, [playing, controls]);
  if (!view) return null;
  const scene = view.to.state;
  const hovered = hover ? scene.areas[hover.index] : null;
  const note = hovered ? timelapseNoteText(timeline.absenceAt(view.to.k, hovered.name)) : null;
  const kinds = [...new Set(scene.areas.map((a) => a.kind).filter(Boolean))];
  const day = data.runs[view.to.k]?.day;
  const label = day ? t('map.timelapseRiskAria', { date: formatShortDate(dayDate(day).toISOString()) }) : undefined;
  return (
    <div ref={containerRef} style={WRAPPER_STYLE}>
      <SkyCanvas areas={scene.areas} average={scene.average} dark={dark} showLabels={showLabels && !view.from}
        selected={null} onSelect={onSelect} onHover={onHover} labelText={riskLabelText}
        nodes={nodes} rings={timeline.rings} label={label} />
      <RiskTooltip area={hovered} at={hover} note={note} />
      <RiskLegend kinds={kinds} />
    </div>
  );
}
