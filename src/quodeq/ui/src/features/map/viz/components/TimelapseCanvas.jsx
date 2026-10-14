import { useEffect, useMemo, useRef } from 'react';
import { useCanvasSize } from './galaxyCanvasSize.js';
import { prepareLayer, useLayerTheme, WRAPPER_STYLE, LAYER_STYLE, KBD_MAX } from './canvasLayer.js';
import { drawStatic, drawOverlay, fadesFor } from '../core/packLayers.js';
import { packViewport, toLayoutPoint, hitCircle } from '../core/packCanvasGeometry.js';
import { useFollowingTransform, useFadeTween } from '../core/packTween.js';
import { runPaint, lerpXyr, screenCoordsInto, cachedRuns, runFocusTransform, TRANSITION } from '../core/timelapseScene.js';
import { createPaintTween, paintTweenAt } from '../core/timelapseTween.js';
import { KEY } from '../../../../vocab/keyboard.js';
import { t } from '../../../../strings/index.js';
import ChartKeyboardControls from '../../../../components/ChartKeyboardControls.jsx';

/** Paint per run for this mode, theme and formula, cached. */
function usePaintAt({ model, nodeDataAt, colorMode, palette, weights }) {
  return useMemo(() => (palette
    ? cachedRuns((k) => runPaint({ model, nodeData: nodeDataAt(k), mode: colorMode, palette, weights }))
    : null), [model, nodeDataAt, colorMode, palette, weights]);
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

/** What each static canvas shows this frame, and how opaque: a move blends positions and paint, a fade crosses both runs. */
function useLayers(view, paintAt) {
  const buffer = useRef(new Float32Array(0));
  const tweenAt = useMoveTweenAt(paintAt);
  return useMemo(() => {
    if (!view || !paintAt) return null;
    const { from, to, kind, t } = view;
    const front = { xyr: to.state, paint: paintAt(to.k) };
    if (!from) return { front, back: null, alpha: 1, backAlpha: 0 };
    // Neither run is opaque (cut-outs, translucent fills, dotted ghosts), so the old one fades out as the new one fades in.
    if (kind === TRANSITION.FADE) return { front, back: { xyr: from.state, paint: paintAt(from.k) }, alpha: t, backAlpha: 1 - t };
    if (buffer.current.length !== to.state.length) buffer.current = new Float32Array(to.state.length);
    const paint = paintTweenAt(tweenAt(from.k, to.k), t);
    return { front: { xyr: lerpXyr(from.state, to.state, t, buffer.current), paint }, back: null, alpha: 1, backAlpha: 0 };
  }, [view, paintAt, tweenAt]);
}

/** One static canvas: the layer's circles through the camera (screen coordinates kept in `coords`), or blank. */
function drawLayer(canvas, layer, { model, camera, viewport, size, coords, fades }) {
  const ctx = prepareLayer(canvas, size);
  if (!ctx) return;
  if (!layer) { ctx.clearRect(0, 0, size.w, size.h); return; }
  screenCoordsInto(layer.xyr, camera, coords);
  drawStatic(ctx, { circles: model.nodes, screenCoords: coords, viewport, paint: layer.paint, index: model.index, width: size.w, height: size.h, fades });
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
 * folder (elsewhere its folder is). Escape zooms out one level.
 */
function usePointer({ model, coords, viewport, focusIndex, interaction, settled }) {
  const hitAt = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const p = toLayoutPoint(e.clientX - box.left, e.clientY - box.top, viewport);
    const i = hitCircle(model.nodes, coords.current, p.x, p.y);
    return i !== null && !model.nodes[i].children && model.parent[i] !== focusIndex ? model.parent[i] : i;
  };
  const zoomOut = () => {
    const parent = model.nodes[focusIndex].parent;
    if (parent) interaction.onDrillDown(parent.data.path);
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

/** Both static canvases, redrawn only when the run on screen, the camera or the canvas changes (never on hover). */
function useStaticLayers({ refs, coords, layers, camera, viewport, size, model, fades }) {
  useEffect(() => {
    if (!layers) return;
    const common = { model, camera, viewport, size, fades };
    drawLayer(refs.back.current, layers.back, { ...common, coords: coords.back.current });
    drawLayer(refs.front.current, layers.front, { ...common, coords: coords.front.current });
    // refs and coords are stable ref objects; the coordinate arrays are filled in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, camera, viewport, size, model, fades]);
}

/**
 * The time-lapse pack on three stacked canvases: a back layer (the run being
 * faded out), a front layer (the run shown, or the move in progress) and an
 * overlay (hover ring, labels once settled). The camera centres the
 * focused folder where the run on screen draws it, at the zoom of its size
 * today, and follows it while runs change.
 */
export default function TimelapseCanvas({ scene, paintInputs, interaction }) {
  const { model, nodeDataAt, anchor, view, focusIndex, label } = scene;
  const { colorMode, weights, dark } = paintInputs;
  const refs = { back: useRef(null), front: useRef(null), overlay: useRef(null) };
  const coords = { back: useRef([]), front: useRef([]) };
  const size = useCanvasSize(refs.overlay);
  const viewport = useMemo(() => packViewport(size.w, size.h), [size.w, size.h]);
  const theme = useLayerTheme(refs.overlay, dark);
  const paintAt = usePaintAt({ model, nodeDataAt, colorMode, palette: theme.palette, weights });
  const layers = useLayers(view, paintAt);
  // A move writes its positions into one reused buffer, so the target follows `layers`, not the array.
  const target = useMemo(() => runFocusTransform(anchor, layers ? layers.front.xyr : anchor, focusIndex), [anchor, layers, focusIndex]);
  const camera = useFollowingTransform(target, focusIndex);
  const settled = Boolean(view && !view.from);
  const targetFades = useMemo(
    () => fadesFor(model.nodes, model.index, { focusNode: model.nodes[focusIndex], hoverNode: interaction.hover === null ? null : model.nodes[interaction.hover] }),
    [model, focusIndex, interaction.hover],
  );
  const fades = useFadeTween(targetFades);
  useStaticLayers({ refs, coords, layers, camera, viewport, size, model, fades });

  useEffect(() => {
    const ctx = prepareLayer(refs.overlay.current, size);
    if (!ctx || !theme.palette || !layers) return;
    drawOverlay(ctx, {
      circles: model.nodes, screenCoords: coords.front.current, viewport, hoverIndex: interaction.hover,
      focusNode: model.nodes[focusIndex], showLabels: interaction.showLabels && settled && camera === target,
      palette: theme.palette, font: theme.font, fontScale: theme.fontScale, width: size.w, height: size.h,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, camera, viewport, size, model, theme, interaction.hover, interaction.showLabels, focusIndex, settled, target]);

  const pointer = usePointer({ model, coords: coords.front, viewport, focusIndex, interaction, settled });
  const folders = useFolderItems({ model, focusIndex, interaction });
  return (
    <>
      <div style={WRAPPER_STYLE}>
        <canvas ref={refs.back} aria-hidden="true" style={{ ...LAYER_STYLE, opacity: layers ? layers.backAlpha : 0 }} />
        <canvas ref={refs.front} aria-hidden="true" style={{ ...LAYER_STYLE, opacity: layers ? layers.alpha : 1 }} />
        <canvas ref={refs.overlay} className="viz-focusable" tabIndex={0} role="img" aria-label={label}
          style={{ ...LAYER_STYLE, cursor: interaction.hover === null ? 'default' : 'pointer' }} {...pointer} />
      </div>
      <ChartKeyboardControls label={t('map.timelapseKbdLabel')} items={folders} />
    </>
  );
}
