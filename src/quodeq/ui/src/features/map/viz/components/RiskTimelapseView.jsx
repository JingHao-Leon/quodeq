import { useCallback, useMemo, useState } from 'react';
import SkyCanvas from './SkyCanvas.jsx';
import RiskLegend from './RiskLegend.jsx';
import RiskTooltip from './RiskTooltip.jsx';
import { WRAPPER_STYLE } from './canvasLayer.js';
import { riskLabelText, riskAreaInfo } from './riskAreaInfo.js';
import { LevelInfoPanel } from './galaxyViewInfo.jsx';
import { useRunTransition } from './useRunTransition.js';
import { lerpSkyNodes, lerpRings } from '../core/skyTimeline.js';
import { TRANSITION } from '../core/timelapseScene.js';
import { dayDate } from '../core/timelapseBarModel.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { t } from '../../../../strings/index.js';

/** Between runs the sky only moves: bubbles tween by name, there is no cross-fade. */
const alwaysMove = () => TRANSITION.MOVE;

/**
 * What the sky draws this frame, aligned by area: tweened from the run before
 * while moving (an area leaving keeps its own paint while it shrinks out),
 * the run's own once settled. Memoised on the view, so a hover render hands
 * SkyCanvas the same arrays and the static sky stays put.
 */
function useViewSky(view) {
  return useMemo(() => {
    if (!view) return null;
    const to = view.to.state;
    const from = view.from?.state;
    if (!from?.nodes.size) return { areas: to.areas, nodes: to.areas.map((a) => to.nodes.get(a.name)), rings: to.rings };
    return {
      areas: to.areas.map((a, i) => (a.absent && from.areas[i] && !from.areas[i].absent ? from.areas[i] : a)),
      nodes: lerpSkyNodes(to.areas, from.nodes, to.nodes, view.t),
      rings: lerpRings(from.rings, to.rings, view.t),
    };
  }, [view]);
}

/**
 * The Risk sky on a past run: each run shows only the areas it had, under its
 * own rings, as today's sky would have drawn it that day; between runs the
 * bubbles move, new areas grow in, gone ones shrink out, and the rings slide.
 * The legend's ring rows hold every kind of the history. Hover shows the
 * run's numbers. A click, playing or paused, selects an area (or clears the
 * selection on empty sky): the selected area stays lit while the runs play,
 * so it can be followed over time, its panel showing each run's numbers
 * (without View Details, which acts on today's data). `timeline` is
 * createSkyTimeline of
 * `timelapse.data`, built (and warmed) by the Risk tab, so a seek finds its
 * run already laid out.
 */
export default function RiskTimelapseView({ timelapse, timeline, dark, showLabels, selection }) {
  const { data, position, moveMs, onSettled } = timelapse;
  const load = useCallback((k) => timeline.sceneAt(k), [timeline]);
  const view = useRunTransition({ target: position, load, kindOf: alwaysMove, durationMs: moveMs, onSettled });
  const sky = useViewSky(view);
  const k = view ? view.to.k : null;
  const [hover, onHover] = useState(null);
  const { selectedName, onSelectName } = selection;
  // Playing or paused, a click selects the area (or clears on empty sky): the selection follows it as the runs play.
  const onSelect = useCallback((i) => onSelectName(i === null ? null : sky?.areas[i]?.name ?? null), [onSelectName, sky]);
  if (!view) return null;
  const selectedIndex = sky.areas.findIndex((a) => a.name === selectedName && !a.absent);
  const chosen = selectedIndex < 0 ? null : sky.areas[selectedIndex];
  const scene = view.to.state;
  // The hover follows its area from run to run (SkyCanvas); an area the run does not have shows no card.
  const hovered = hover && sky.areas[hover.index] && !sky.areas[hover.index].absent ? sky.areas[hover.index] : null;
  const day = data.runs[k]?.day;
  const label = day ? t('map.timelapseRiskAria', { date: formatShortDate(dayDate(day).toISOString()) }) : undefined;
  return (
    <div style={WRAPPER_STYLE}>
      <SkyCanvas areas={sky.areas} average={scene.average} dark={dark} showLabels={showLabels}
        selected={selectedIndex < 0 ? null : selectedIndex} onSelect={onSelect} onHover={onHover} labelText={riskLabelText}
        nodes={sky.nodes} rings={sky.rings} label={label} />
      <RiskTooltip area={hovered} />
      <LevelInfoPanel levelInfo={chosen && riskAreaInfo(chosen)} label={chosen ? t('map.riskPanelAria', { name: chosen.name }) : undefined}
        onClose={() => onSelectName(null)} onEscape={() => onSelectName(null)} />
      <RiskLegend kinds={timeline.kinds()} />
    </div>
  );
}
