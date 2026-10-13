import { useCallback, useMemo, useRef, useState } from 'react';
import SkyCanvas from './SkyCanvas.jsx';
import RiskLegend from './RiskLegend.jsx';
import RiskTooltip from './RiskTooltip.jsx';
import { WRAPPER_STYLE } from './canvasLayer.js';
import { riskLabelText, riskItemText } from './riskAreaInfo.js';
import { useRunTransition } from './useRunTransition.js';
import { timelapseNoteText } from './timelapseNote.js';
import { lerpSkyNodes } from '../core/skyTimeline.js';
import { TRANSITION } from '../core/timelapseScene.js';
import { dayDate } from '../core/timelapseBarModel.js';
import { hoverWithTooltipPos } from '../core/tooltipPlacement.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { t } from '../../../../strings/index.js';

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

/**
 * Hover with its clamped tooltip box, tied to the run it was taken on: a step
 * to another run clears it (as the sky clears its ring), and play drops it,
 * so a pause never brings back the area hovered before play.
 */
function useTimelapseHover(containerRef, { playing, k }) {
  const [held, setHeld] = useState({ k, hover: null });
  if (playing && held.hover !== null) setHeld({ k, hover: null });
  const onHover = useCallback((h) => setHeld({ k, hover: hoverWithTooltipPos(h, containerRef.current) }), [containerRef, k]);
  return [playing || held.k !== k ? null : held.hover, onHover];
}

/**
 * Canvas label and keyboard-list text for run k: a dotted area says since
 * when it is gone (or when it first appears) instead of reading as clean.
 */
function useAreaTexts(timeline, k) {
  return useMemo(() => {
    const noteOf = (a) => (a.ghost ? timelapseNoteText(timeline.absenceAt(k, a.name)) : null);
    return {
      labelText: (a) => { const note = noteOf(a); return note ? { title: a.name, sub: note } : riskLabelText(a); },
      itemText: (a) => { const note = noteOf(a); return note ? t('map.riskAreaAbsentAria', { name: a.name, note }) : riskItemText(a); },
    };
  }, [timeline, k]);
}

/**
 * The Risk sky on a past run (plan Decision 11): every area that is ever a
 * bubble, dotted where it has no file; bubbles drift from run to run under the
 * history's rings, which stay put while the runs play, as do the legend's
 * ring rows (every kind of the history). Playing: a click
 * pauses. Paused: hover shows the run's numbers (or since when a dotted area
 * is gone); there is no selection, since View Details acts on today's data.
 * `timeline` is createSkyTimeline of `timelapse.data`, built (and warmed) by
 * the Risk tab, so a seek finds its run already settled.
 */
export default function RiskTimelapseView({ timelapse, timeline, dark, showLabels }) {
  const { data, position, playing, moveMs, onSettled, controls } = timelapse;
  const load = useCallback((k) => timeline.sceneAt(k), [timeline]);
  const view = useRunTransition({ target: position, load, kindOf: alwaysMove, durationMs: moveMs, onSettled });
  const nodes = useViewNodes(view);
  const containerRef = useRef(null);
  const k = view ? view.to.k : null;
  const [hover, onHover] = useTimelapseHover(containerRef, { playing, k });
  const { labelText, itemText } = useAreaTexts(timeline, k);
  const onSelect = useCallback(() => { if (playing) controls.pause(); }, [playing, controls]);
  if (!view) return null;
  const scene = view.to.state;
  const hovered = hover ? scene.areas[hover.index] : null;
  const note = hovered ? timelapseNoteText(timeline.absenceAt(k, hovered.name)) : null;
  const day = data.runs[k]?.day;
  const label = day ? t('map.timelapseRiskAria', { date: formatShortDate(dayDate(day).toISOString()) }) : undefined;
  return (
    <div ref={containerRef} style={WRAPPER_STYLE}>
      <SkyCanvas areas={scene.areas} average={scene.average} dark={dark} showLabels={showLabels && !view.from}
        selected={null} onSelect={onSelect} onHover={onHover} hoverable={!playing} labelText={labelText} itemText={itemText}
        nodes={nodes} rings={timeline.rings()} label={label} />
      <RiskTooltip area={hovered} at={hover} note={note} />
      <RiskLegend kinds={timeline.kinds()} />
    </div>
  );
}
