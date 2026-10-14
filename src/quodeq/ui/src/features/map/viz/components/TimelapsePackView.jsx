import { useCallback, useEffect, useMemo, useState } from 'react';
import TimelapseCanvas from './TimelapseCanvas.jsx';
import PackTooltip from './PackTooltip.jsx';
import { WRAPPER_STYLE } from './canvasLayer.js';
import { useRunTransition } from './useRunTransition.js';
import { buildTimelapseModel } from '../core/timelapseModel.js';
import { createTimelapseLayouts } from '../core/timelapseLayouts.js';
import { runNodeData, transitionKind, focusIndexFor, cachedRuns } from '../core/timelapseScene.js';
import { dayDate } from '../core/timelapseBarModel.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../core/mapBadness.js';
import { XYR_STRIDE, XYR_R } from '../core/packLayout.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { t } from '../../../../strings/index.js';


/** A layout that failed even on this thread: the view keeps what it shows, the console says why. */
function warnLayoutFailed(err) {
  console.warn('[TimelapsePackView] time-lapse layout failed', err);
}

/** The whole-history layout every run is framed in, once the worker has it (never another model's). */
function useAnchor(layouts) {
  const [held, setHeld] = useState({ layouts: null, anchor: null });
  useEffect(() => {
    let live = true;
    layouts.anchor().then((anchor) => { if (live) setHeld({ layouts, anchor }); }).catch(warnLayoutFailed);
    return () => { live = false; };
  }, [layouts]);
  return held.layouts === layouts ? held.anchor : null;
}

/** While playing, lay out the next run ahead so the move can start on time. */
function usePrefetch(layouts, { position, playing, data }) {
  useEffect(() => {
    if (playing && position + 1 < data.runs.length) layouts.run(position + 1).catch(warnLayoutFailed);
  }, [layouts, position, playing, data]);
}

/** Hover index tied to the folder it was taken under (a zoom or another
 * history reads as "no hover" until the pointer moves again). Play drops it,
 * so a pause never brings back the circle hovered before play. */
function useHover(focusNode) {
  const [state, setState] = useState({ focusNode, index: null });
  const setHover = useCallback((index) => setState({ focusNode, index }), [focusNode]);
  return [state.focusNode !== focusNode ? null : state.index, setHover];
}

/** The hovered circle with run k's numbers (a run draws only what it holds, so it is always there). */
function useTip({ model, nodeDataAt, k, hover, shown }) {
  return useMemo(() => {
    // The hover follows its circle while the runs play; a run that does not hold it shows no card.
    if (hover === null || k === null || !shown(hover)) return null;
    return { depth: model.nodes[hover].depth, data: nodeDataAt(k)[hover] };
  }, [model, nodeDataAt, k, hover, shown]);
}

/** The model, its layouts and the run transition toward `position`. */
function useTimelapseScene({ data, position, moveMs, onSettled }) {
  const model = useMemo(() => buildTimelapseModel(data), [data]);
  const layouts = useMemo(() => createTimelapseLayouts(model), [model]);
  const nodeDataAt = useMemo(() => cachedRuns((k) => runNodeData(model, data, k)), [model, data]);
  const anchor = useAnchor(layouts);
  const load = useCallback((k) => layouts.run(k), [layouts]);
  const view = useRunTransition({ target: position, load, kindOf: transitionKind, durationMs: moveMs, onSettled });
  return { model, layouts, nodeDataAt, anchor, view };
}

/**
 * The Circle Pack on a past run (time-lapse): the whole-history tree laid out
 * per run in the worker, each run showing only what it holds, and every
 * change between runs a move: circles slide with their folder, new ones grow
 * in, gone ones shrink out. Hover shows the run's numbers, playing or
 * paused. Paused: a click goes through `onDrillDown`. Playing: a click pauses. No info panel: it
 * would act on today's data.
 */
export default function TimelapsePackView({
  timelapse, colorMode, weights = DEFAULT_SEVERITY_WEIGHTS, dark = false, showLabels = true, currentPath = '', onDrillDown,
}) {
  const { data, playing, controls } = timelapse;
  const { model, layouts, nodeDataAt, anchor, view } = useTimelapseScene(timelapse);
  usePrefetch(layouts, timelapse);
  // A full scan of the tree: only when the focus path or the tree changes, never per frame.
  const focusIndex = useMemo(() => focusIndexFor(model, currentPath), [model, currentPath]);
  const [hover, setHover] = useHover(model.nodes[focusIndex]);
  const shown = useCallback((i) => Boolean(view && view.to.state[i * XYR_STRIDE + XYR_R] > 0), [view]);
  const tip = useTip({ model, nodeDataAt, k: view ? view.to.k : null, hover, shown });
  if (!view || !anchor) return null;
  const date = formatShortDate(dayDate(data.runs[view.to.k].day).toISOString());
  return (
    <div style={WRAPPER_STYLE}>
      <TimelapseCanvas
        scene={{ model, nodeDataAt, anchor, view, focusIndex, label: t('map.timelapsePackAria', { date }) }}
        paintInputs={{ colorMode, weights, dark }}
        interaction={{ playing, pause: controls.pause, hover, setHover, onDrillDown, showLabels }}
      />
      <PackTooltip node={tip} />
    </div>
  );
}
