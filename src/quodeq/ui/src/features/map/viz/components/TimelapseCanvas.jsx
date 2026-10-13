import { useEffect, useMemo, useRef } from 'react';
import { useCanvasSize } from './galaxyCanvasSize.js';
import { prepareLayer, useLayerTheme, WRAPPER_STYLE, LAYER_STYLE, KBD_MAX } from './canvasLayer.js';
import { drawStatic, drawOverlay } from '../core/packLayers.js';
import { packViewport, toLayoutPoint, hitCircle, focusTransformFor } from '../core/packCanvasGeometry.js';
import { useTweenedTransform } from '../core/packTween.js';
import { circleAt } from '../core/packLayout.js';
import { runPaint, movePaint, lerpXyr, screenCoordsInto, cachedRuns, TRANSITION } from '../core/timelapseScene.js';
import { KEY } from '../../../../vocab/keyboard.js';
import { t } from '../../../../strings/index.js';
import ChartKeyboardControls from '../../../../components/ChartKeyboardControls.jsx';

/** Paint per run for this mode, theme and formula, cached. */
function usePaintAt({ model, nodeDataAt, colorMode, palette, weights }) {
  return useMemo(() => (palette
    ? cachedRuns((k) => runPaint({ model, nodeData: nodeDataAt(k), mode: colorMode, palette, weights }))
    : null), [model, nodeDataAt, colorMode, palette, weights]);
}

/** The paint of a move between two runs (leaving circles keep their old paint), kept for the move in progress. */
function useMovePaintAt(paintAt) {
  return useMemo(() => {
    if (!paintAt) return null;
    let last = { from: null, to: null, paint: null };
    return (from, to) => {
      if (last.from !== from || last.to !== to) last = { from, to, paint: movePaint(paintAt(from), paintAt(to)) };
      return last.paint;
    };
  }, [paintAt]);
}

/** What each static canvas shows this frame, and how opaque: a move interpolates, a fade crosses both runs. */
function useLayers(view, paintAt) {
  const buffer = useRef(new Float32Array(0));
  const movePaintAt = useMovePaintAt(paintAt);
  return useMemo(() => {
    if (!view || !paintAt) return null;
    const { from, to, kind, t } = view;
    const front = { xyr: to.state, paint: paintAt(to.k) };
    if (!from) return { front, back: null, alpha: 1, backAlpha: 0 };
    // Neither run is opaque (cut-outs, translucent fills, dotted ghosts), so the old one fades out as the new one fades in.
    if (kind === TRANSITION.FADE) return { front, back: { xyr: from.state, paint: paintAt(from.k) }, alpha: t, backAlpha: 1 - t };
    if (buffer.current.length !== to.state.length) buffer.current = new Float32Array(to.state.length);
    return { front: { xyr: lerpXyr(from.state, to.state, t, buffer.current), paint: movePaintAt(from.k, to.k) }, back: null, alpha: 1, backAlpha: 0 };
  }, [view, paintAt, movePaintAt]);
}

/** One static canvas: the layer's circles through the camera (screen coordinates kept in `coords`), or blank. */
function drawLayer(canvas, layer, { model, camera, viewport, size, coords }) {
  const ctx = prepareLayer(canvas, size);
  if (!ctx) return;
  if (!layer) { ctx.clearRect(0, 0, size.w, size.h); return; }
  screenCoordsInto(layer.xyr, camera, coords);
  drawStatic(ctx, { circles: model.nodes, screenCoords: coords, viewport, paint: layer.paint, index: model.index, width: size.w, height: size.h });
}

/**
 * Pointer and keyboard on the overlay. Playing: no hover, any click pauses.
 * Paused: hover once the run has settled, a folder click zooms into it, a
 * background click or Escape zooms out, a file click does nothing.
 */
function usePointer({ model, coords, viewport, focusIndex, interaction, settled }) {
  const hitAt = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const p = toLayoutPoint(e.clientX - box.left, e.clientY - box.top, viewport);
    return hitCircle(model.nodes, coords.current, p.x, p.y);
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
      if (i === null) zoomOut();
      else if (i !== focusIndex && model.nodes[i].children) interaction.onDrillDown(model.nodes[i].data.path);
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
function useStaticLayers({ refs, coords, layers, camera, viewport, size, model }) {
  useEffect(() => {
    if (!layers) return;
    const common = { model, camera, viewport, size };
    drawLayer(refs.back.current, layers.back, { ...common, coords: coords.back.current });
    drawLayer(refs.front.current, layers.front, { ...common, coords: coords.front.current });
    // refs and coords are stable ref objects; the coordinate arrays are filled in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, camera, viewport, size, model]);
}

/**
 * The time-lapse pack on three stacked canvases: a back layer (the run being
 * faded out), a front layer (the run shown, or the move in progress) and an
 * overlay (veil, hover ring, labels once settled). The camera frames the
 * focused folder's whole-history circle, so it holds still while runs change.
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
  const target = useMemo(() => focusTransformFor(circleAt(anchor, focusIndex)), [anchor, focusIndex]);
  const camera = useTweenedTransform(target);
  const layers = useLayers(view, paintAt);
  const settled = Boolean(view && !view.from);
  useStaticLayers({ refs, coords, layers, camera, viewport, size, model });

  useEffect(() => {
    const ctx = prepareLayer(refs.overlay.current, size);
    if (!ctx || !theme.palette || !layers) return;
    const keep = interaction.hover ?? (focusIndex > 0 ? focusIndex : null);
    drawOverlay(ctx, {
      circles: model.nodes, screenCoords: coords.front.current, viewport, keepIndex: keep, hoverIndex: interaction.hover,
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
