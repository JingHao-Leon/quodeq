import { useCallback, useEffect, useMemo, useState } from 'react';
import TimelapseCanvas from './TimelapseCanvas.jsx';
import PackTooltip from './PackTooltip.jsx';
import { WRAPPER_STYLE } from './canvasLayer.js';
import { useRunTransition } from './useRunTransition.js';
import { buildTimelapseModel } from '../core/timelapseModel.js';
import { createTimelapseLayouts } from '../core/timelapseLayouts.js';
import { runNodeData, transitionKind, focusIndexFor, cachedRuns, chainEndsIn } from '../core/timelapseScene.js';
import { LevelInfoPanel } from './galaxyViewInfo.jsx';
import { computeLevelInfo } from './packLevelInfo.js';
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
function usePrefetch(layouts, { playing, nextPosition }) {
  useEffect(() => {
    if (playing && nextPosition !== null && nextPosition !== undefined) layouts.run(nextPosition).catch(warnLayoutFailed);
  }, [layouts, playing, nextPosition]);
}

/** Hover index tied to the folder it was taken under (a zoom or another
 * history reads as "no hover" until the pointer moves again). Play drops it,
 * so a pause never brings back the circle hovered before play. */
function useHover(focusNode) {
  const [state, setState] = useState({ focusNode, index: null });
  const setHover = useCallback((index) => setState({ focusNode, index }), [focusNode]);
  return [state.focusNode !== focusNode ? null : state.index, setHover];
}

/** The selected file as a node index, by path through the page's `selection` (shared with today's pack). */
function usePicked(model, selection) {
  const fileIndex = useMemo(() => new Map(model.nodes.flatMap((n, i) => (n.children ? [] : [[n.data.path, i]]))), [model]);
  const pick = useCallback((index) => selection?.onSelect(index === null ? null : model.nodes[index].data.path), [model, selection]);
  const path = selection?.path;
  return [path ? fileIndex.get(path) ?? null : null, pick];
}

/**
 * The panel, top right: the selected file, else the open folder (the end of
 * its chain that day), with run k's numbers. View Details (`onPastDetails`)
 * opens that day's findings for it, read-only, not today's page.
 */
function usePanel({ model, nodeDataAt, k, focusIndex, selected, run, onPastDetails }) {
  return useMemo(() => {
    if (k === null) return null;
    const data = nodeDataAt(k);
    const ends = chainEndsIn(model, k);
    const focus = ends[focusIndex] >= 0 ? ends[focusIndex] : focusIndex;
    const i = selected ?? focus;
    if (!data[i] || data[i].absent) return null;
    // Count only what the run holds: a folder's absent children are not its contents that day.
    const live = (d) => (d.children ? { ...d, children: d.children.filter((c) => !c.absent) } : d);
    const root = { data: live(data[0]) };
    const info = computeLevelInfo(i === 0 ? root : { data: live(data[i]) }, root);
    const own = data[i];
    const detailAction = i > 0 && onPastDetails && run?.runId ? () => onPastDetails({ path: own.path, isFile: Boolean(own.isFile) }, run) : null;
    return info && { ...info, detailAction };
  }, [model, nodeDataAt, k, focusIndex, selected, run, onPastDetails]);
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
 * paused. A click, playing or paused, opens a folder through `onDrillDown`
 * or selects a file of the open folder; the panel shows the selected file,
 * else the open folder, with that run's numbers, and View Details
 * (`onPastDetails`) opens that day's findings for it, read-only.
 */
export default function TimelapsePackView({
  timelapse, colorMode, weights = DEFAULT_SEVERITY_WEIGHTS, dark = false, showLabels = true, currentPath = '', onDrillDown, selection = null, onPastDetails,
}) {
  const { data } = timelapse;
  const { model, layouts, nodeDataAt, anchor, view } = useTimelapseScene(timelapse);
  usePrefetch(layouts, timelapse);
  // A full scan of the tree: only when the focus path or the tree changes, never per frame.
  const focusIndex = useMemo(() => focusIndexFor(model, currentPath), [model, currentPath]);
  const [hover, setHover] = useHover(model.nodes[focusIndex]);
  const shown = useCallback((i) => Boolean(view && view.to.state[i * XYR_STRIDE + XYR_R] > 0), [view]);
  const tip = useTip({ model, nodeDataAt, k: view ? view.to.k : null, hover, shown });
  const [selected, onSelectFile] = usePicked(model, selection);
  const panelSelected = selected !== null && shown(selected) ? selected : null;
  const k = view ? view.to.k : null;
  const panel = usePanel({ model, nodeDataAt, k, focusIndex, selected: panelSelected, run: k === null ? null : data.runs[k], onPastDetails });
  if (!view || !anchor) return null;
  const date = formatShortDate(dayDate(data.runs[view.to.k].day).toISOString());
  return (
    <div style={WRAPPER_STYLE}>
      <TimelapseCanvas
        scene={{ model, nodeDataAt, anchor, view, focusIndex, label: t('map.timelapsePackAria', { date }) }}
        paintInputs={{ colorMode, weights, dark }}
        interaction={{ hover, setHover, onDrillDown, showLabels, selected, onSelectFile }}
      />
      <PackTooltip node={tip} />
      <LevelInfoPanel levelInfo={panel} onClose={panelSelected ? () => onSelectFile(null) : undefined} />
    </div>
  );
}
