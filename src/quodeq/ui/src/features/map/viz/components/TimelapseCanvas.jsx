import { useEffect, useMemo, useRef } from 'react';
import { useCanvasSize } from './galaxyCanvasSize.js';
import { prepareLayer, useLayerTheme, WRAPPER_STYLE, LAYER_STYLE, KBD_MAX } from './canvasLayer.js';
import { drawStatic, drawOverlay, fadesFor } from '../core/packLayers.js';
import { packViewport, toLayoutPoint, hitCircle } from '../core/packCanvasGeometry.js';
import { useFollowingTransform, useFadeTween } from '../core/packTween.js';
import { runPaint, lerpXyr, screenCoordsInto, cachedRuns, runFocusTransform, chainEndsIn } from '../core/timelapseScene.js';
import { createPaintTween, paintTweenAt } from '../core/timelapseTween.js';
import { KEY } from '../../../../vocab/keyboard.js';
import { t } from '../../../../strings/index.js';
import ChartKeyboardControls from '../../../../components/ChartKeyboardControls.jsx';

/** A folder drawn as the end of its chain that run paints nothing of its own: the end draws the circle. */
function hideChainWrappers(paint, ends) {
  return paint.map((p, i) => (p && ends[i] >= 0 && ends[i] !== i ? { ...p, outlineOnly: true, strokeAlpha: 0 } : p));
}

/** Paint per run for this mode, theme and formula, cached. */
function usePaintAt({ model, nodeDataAt, endsAt, colorMode, palette, weights }) {
  return useMemo(() => (palette
    ? cachedRuns((k) => hideChainWrappers(runPaint({ model, nodeData: nodeDataAt(k), mode: colorMode, palette, weights }), endsAt(k)))
    : null), [model, nodeDataAt, endsAt, colorMode, palette, weights]);
}

/** The paint tween of a move between two runs, kept for the move in progress. */
function useMoveTweenAt(paintAt) {
  return useMemo(() => {
    if (!paintAt) return null;
    let last = { from: null, to: null, tween: null };
    return (from, to) => {
      if (last.from !== from || last.to !== to) last = { from, to, tween: createPaintTween(paintAt(from), paintAt(to)) };
      return last.tween;
    };
  }, [paintAt]);
}

/** What the canvas shows this frame: the run, or a move blending positions (each relative to its parent) and paint. */
function useLayer(view, paintAt, parent) {
  const buffer = useRef(new Float32Array(0));
  const tweenAt = useMoveTweenAt(paintAt);
  return useMemo(() => {
    if (!view || !paintAt) return null;
    const { from, to, t } = view;
    if (!from) return { xyr: to.state, paint: paintAt(to.k) };
    if (buffer.current.length !== to.state.length) buffer.current = new Float32Array(to.state.length);
    return { xyr: lerpXyr(parent, from.state, to.state, t, buffer.current), paint: paintTweenAt(tweenAt(from.k, to.k), t) };
  }, [view, paintAt, tweenAt, parent]);
}

/** The node a hit or a focus on `i` means in a run: the end of its chain. */
const chainEnd = (ends, i) => (i !== null && ends && ends[i] >= 0 ? ends[i] : i);

/** The folder above the chain `i` belongs to in a run (where zooming out goes), -1 at the top. */
function aboveChain(model, ends, i) {
  let j = i;
  while (j > 0 && ends && ends[model.parent[j]] === ends[j]) j = model.parent[j];
  return j > 0 ? model.parent[j] : -1;
}

/** Where a click on node `i` goes: a folder opens itself, a file its folder, a miss (null) the top. */
function clickTarget(model, i) {
  if (i === null) return 0;
  return model.nodes[i].children ? i : model.parent[i];
}

/**
 * Pointer and keyboard on the overlay. Playing: no hover, any click pauses.
 * Paused: hover once the run has settled; a click goes where it lands: a
 * folder or ring opens that folder, a file outside the open folder opens its
 * folder, a miss goes to the top. A file is picked only inside the open
 * folder (elsewhere its folder is), and a collapsed chain is picked as its
 * end. Escape zooms out one level.
 */
function usePointer({ model, coords, viewport, focusIndex, interaction, settled, ends }) {
  const hitAt = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const p = toLayoutPoint(e.clientX - box.left, e.clientY - box.top, viewport);
    const i = hitCircle(model.nodes, coords.current, p.x, p.y);
    return chainEnd(ends, i !== null && !model.nodes[i].children && model.parent[i] !== focusIndex ? model.parent[i] : i);
  };
  const zoomOut = () => {
    const parent = aboveChain(model, ends, focusIndex);
    if (parent >= 0) interaction.onDrillDown(parent > 0 ? model.nodes[parent].data.path : '');
  };
  return {
    onMouseMove: (e) => {
      const i = interaction.playing || !settled ? null : hitAt(e);
      const picked = i === focusIndex ? null : i;
      if (picked !== interaction.hover) interaction.setHover(picked);
    },
    onMouseLeave: () => interaction.setHover(null),
    onClick: (e) => {
      if (interaction.playing) { interaction.pause(); return; }
      const i = hitAt(e);
      const target = clickTarget(model, i);
      if (target !== focusIndex) interaction.onDrillDown(target > 0 ? model.nodes[target].data.path : '');
    },
    onKeyDown: (e) => {
      if (e.key !== KEY.ESCAPE) return;
      e.preventDefault();
      zoomOut();
    },
  };
}

/**
 * The keyboard's way in: one focusable button per sub-folder of the focused
 * folder, doing what a click on that folder does (pause while playing, else
 * zoom in). Escape on the canvas zooms out.
 */
function useFolderItems({ model, focusIndex, interaction }) {
  const { playing, pause, onDrillDown } = interaction;
  return useMemo(() => {
    const folders = (model.nodes[focusIndex].children || []).filter((c) => c.children).slice(0, KBD_MAX);
    return folders.map((c) => ({
      key: c.data.path,
      text: c.data.name,
      onActivate: () => (playing ? pause() : onDrillDown(c.data.path)),
    }));
  }, [model, focusIndex, playing, pause, onDrillDown]);
}

/** The circles canvas, redrawn when the run on screen, the camera, the brightness or the canvas changes. */
function useStaticLayer({ ref, coords, layer, camera, viewport, size, model, fades }) {
  useEffect(() => {
    const ctx = prepareLayer(ref.current, size);
    if (!ctx || !layer) return;
    screenCoordsInto(layer.xyr, camera, coords.current);
    drawStatic(ctx, { circles: model.nodes, screenCoords: coords.current, viewport, paint: layer.paint, index: model.index, width: size.w, height: size.h, fades });
    // ref and coords are stable ref objects; the coordinate array is filled in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, camera, viewport, size, model, fades]);
}

/** The run's chain ends and the folder the view is in, as that run draws it. */
function useChains(model, view, focusIndex) {
  const endsAt = useMemo(() => cachedRuns((k) => chainEndsIn(model, k)), [model]);
  const ends = view ? endsAt(view.to.k) : null;
  return { endsAt, ends, shownFocus: chainEnd(ends, focusIndex) };
}

/**
 * The time-lapse pack on two stacked canvases: the circles (the run shown,
 * or the move in progress, every circle moving with its parent and growing
 * in or shrinking out) and an overlay (hover ring and labels, kept through
 * moves). The camera frames the focused folder at the run's size, where the
 * run draws it, and follows it while runs change.
 */
export default function TimelapseCanvas({ scene, paintInputs, interaction }) {
  const { model, nodeDataAt, anchor, view, focusIndex, label } = scene;
  const { colorMode, weights, dark } = paintInputs;
  const refs = { front: useRef(null), overlay: useRef(null) };
  const coords = useRef([]);
  const size = useCanvasSize(refs.overlay);
  const viewport = useMemo(() => packViewport(size.w, size.h), [size.w, size.h]);
  const theme = useLayerTheme(refs.overlay, dark);
  const { endsAt, ends, shownFocus } = useChains(model, view, focusIndex);
  const paintAt = usePaintAt({ model, nodeDataAt, endsAt, colorMode, palette: theme.palette, weights });
  const layer = useLayer(view, paintAt, model.parent);
  // A move writes its positions into one reused buffer, so the target follows `layer`, not the array.
  const target = useMemo(() => runFocusTransform(model.parent, layer ? layer.xyr : anchor, focusIndex), [model, anchor, layer, focusIndex]);
  const camera = useFollowingTransform(target, focusIndex);
  const settled = Boolean(view && !view.from);
  const hoverNode = interaction.hover === null ? null : model.nodes[interaction.hover];
  const targetFades = useMemo(
    () => fadesFor(model.nodes, model.index, { focusNode: model.nodes[shownFocus], hoverNode }),
    [model, shownFocus, hoverNode],
  );
  const fades = useFadeTween(targetFades);
  useStaticLayer({ ref: refs.front, coords, layer, camera, viewport, size, model, fades });

  useEffect(() => {
    const ctx = prepareLayer(refs.overlay.current, size);
    if (!ctx || !theme.palette || !layer) return;
    drawOverlay(ctx, {
      circles: model.nodes, screenCoords: coords.current, viewport, hoverIndex: interaction.hover,
      focusNode: model.nodes[shownFocus], showLabels: interaction.showLabels,
      nameOf: (i) => model.nodes[chainEnd(ends, i)].data.name,
      palette: theme.palette, font: theme.font, fontScale: theme.fontScale, width: size.w, height: size.h,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, camera, viewport, size, model, theme, interaction.hover, interaction.showLabels, shownFocus, ends]);

  const pointer = usePointer({ model, coords, viewport, focusIndex: shownFocus, interaction, settled, ends });
  const folders = useFolderItems({ model, focusIndex: shownFocus, interaction });
  return (
    <>
      <div style={WRAPPER_STYLE}>
        <canvas ref={refs.front} aria-hidden="true" style={LAYER_STYLE} />
        <canvas ref={refs.overlay} className="viz-focusable" tabIndex={0} role="img" aria-label={label}
          style={{ ...LAYER_STYLE, cursor: interaction.hover === null ? 'default' : 'pointer' }} {...pointer} />
      </div>
      <ChartKeyboardControls label={t('map.timelapseKbdLabel')} items={folders} />
    </>
  );
}
