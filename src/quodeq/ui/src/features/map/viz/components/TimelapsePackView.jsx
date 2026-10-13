import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TimelapseCanvas from './TimelapseCanvas.jsx';
import PackTooltip from './PackTooltip.jsx';
import { WRAPPER_STYLE } from './canvasLayer.js';
import { useRunTransition } from './useRunTransition.js';
import { timelapseNoteText } from './timelapseNote.js';
import { buildTimelapseModel } from '../core/timelapseModel.js';
import { createTimelapseLayouts } from '../core/timelapseLayouts.js';
import { runNodeData, absenceNote, transitionKind, focusIndexFor, cachedRuns } from '../core/timelapseScene.js';
import { dayDate } from '../core/timelapseBarModel.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../core/mapBadness.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { t } from '../../../../strings/index.js';

const NO_TIP = Object.freeze({ node: null, note: null });

/** The whole-history layout every run is framed in, once the worker has it (never another model's). */
function useAnchor(layouts) {
  const [held, setHeld] = useState({ layouts: null, anchor: null });
  useEffect(() => {
    let live = true;
    void layouts.anchor().then((anchor) => { if (live) setHeld({ layouts, anchor }); });
    return () => { live = false; };
  }, [layouts]);
  return held.layouts === layouts ? held.anchor : null;
}

/** While playing, lay out the next run ahead so the move can start on time. */
function usePrefetch(layouts, { position, playing, data }) {
  useEffect(() => {
    if (playing && position + 1 < data.runs.length) void layouts.run(position + 1);
  }, [layouts, position, playing, data]);
}

/** Hover index tied to the folder it was taken under (a zoom or another
 * history reads as "no hover" until the pointer moves again); always none
 * while playing. */
function useHover(focusNode, playing) {
  const [state, setState] = useState({ focusNode, index: null });
  const setHover = useCallback((index) => setState({ focusNode, index }), [focusNode]);
  return [playing || state.focusNode !== focusNode ? null : state.index, setHover];
}

/** The hovered circle with run k's numbers, or why it is dotted in run k. */
function useTip({ model, data, nodeDataAt, k, hover }) {
  return useMemo(() => {
    if (hover === null || k === null) return NO_TIP;
    const node = { depth: model.nodes[hover].depth, data: nodeDataAt(k)[hover] };
    return { node, note: timelapseNoteText(absenceNote(model, data.runs, k, hover)) };
  }, [model, data, nodeDataAt, k, hover]);
}

/** The model, its layouts and the run transition toward `position`. */
function useTimelapseScene({ data, position, moveMs, onSettled }) {
  const model = useMemo(() => buildTimelapseModel(data), [data]);
  const layouts = useMemo(() => createTimelapseLayouts(model), [model]);
  const nodeDataAt = useMemo(() => cachedRuns((k) => runNodeData(model, data, k)), [model, data]);
  const anchor = useAnchor(layouts);
  const load = useCallback((k) => layouts.run(k), [layouts]);
  const kindOf = useCallback((a, b) => transitionKind(model, a, b), [model]);
  const view = useRunTransition({ target: position, load, kindOf, durationMs: moveMs, onSettled });
  return { model, layouts, nodeDataAt, anchor, view };
}

/**
 * The Circle Pack on a past run (time-lapse): the whole-history tree laid out
 * per run in the worker, moving or cross-fading between runs, absent files
 * and folders drawn dotted. Paused: hover shows the run's numbers (or since
 * when a dotted circle is gone), a folder click zooms through `onDrillDown`.
 * Playing: a click pauses. No info panel: it would act on today's data.
 */
export default function TimelapsePackView({
  timelapse, colorMode, weights = DEFAULT_SEVERITY_WEIGHTS, dark = false, showLabels = true, currentPath = '', onDrillDown,
}) {
  const { data, playing, controls } = timelapse;
  const { model, layouts, nodeDataAt, anchor, view } = useTimelapseScene(timelapse);
  usePrefetch(layouts, timelapse);
  // A full scan of the tree: only when the focus path or the tree changes, never per frame.
  const focusIndex = useMemo(() => focusIndexFor(model, currentPath), [model, currentPath]);
  const [hover, setHover] = useHover(model.nodes[focusIndex], playing);
  const tip = useTip({ model, data, nodeDataAt, k: view ? view.to.k : null, hover });
  const mousePos = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);
  if (!view || !anchor) return null;
  const trackMouse = (e) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (box) mousePos.current = { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const date = formatShortDate(dayDate(data.runs[view.to.k].day).toISOString());
  return (
    <div ref={containerRef} style={WRAPPER_STYLE} onMouseMove={trackMouse}>
      <TimelapseCanvas
        scene={{ model, nodeDataAt, anchor, view, focusIndex, label: t('map.timelapsePackAria', { date }) }}
        paintInputs={{ colorMode, weights, dark }}
        interaction={{ playing, pause: controls.pause, hover, setHover, onDrillDown, showLabels }}
      />
      <PackTooltip node={tip.node} note={tip.note} mousePos={mousePos} containerRef={containerRef} />
    </div>
  );
}
