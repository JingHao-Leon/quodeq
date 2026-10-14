import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChartKeyboardControls from '../../../../components/ChartKeyboardControls.jsx';
import { useCanvasSize } from './galaxyCanvasSize.js';
import { prepareLayer, useLayerTheme, KBD_MAX, WRAPPER_STYLE, LAYER_STYLE } from './canvasLayer.js';
import { useSkyScene } from './useSkyScene.js';
import { pickBubble, drawSkyStatic, drawSkyOverlay, skyTitleFont, skyZoneFont } from '../core/skyLayers.js';
import { riskItemText } from './riskAreaInfo.js';
import { t } from '../../../../strings/index.js';
import { KEY } from '../../../../vocab/keyboard.js';

const BY_KEYBOARD = true;

/** Text widths on the canvas: an area's label, and a zone's label. */
function useMeasure(overlayRef, theme, { areas, labelText }) {
  return useMemo(() => {
    const width = (text, fontOf) => {
      const ctx = overlayRef.current?.getContext('2d');
      if (!ctx) return 0;
      ctx.font = fontOf(theme.font, theme.fontScale);
      return ctx.measureText(text).width;
    };
    const area = (i) => width(labelText(areas[i]).title, skyTitleFont);
    return { area, zone: (text) => width(text, skyZoneFont), fontScale: theme.fontScale || 1 };
  }, [overlayRef, theme, areas, labelText]);
}

function kbdItems(areas, onSelect) {
  return areas.map((a, i) => [a, i]).filter(([a]) => !a.absent).sort((p, q) => q[0].density - p[0].density).slice(0, KBD_MAX)
    .map(([a, i]) => ({ key: a.name, text: riskItemText(a), onActivate: () => onSelect(i, BY_KEYBOARD) }));
}

/** With nothing hovered, Enter or Space hands focus to the keyboard list that follows the canvas. */
function focusFirstKeyboardItem(canvas) {
  canvas.parentElement?.nextElementSibling?.querySelector('button')?.focus();
}

function pointerAt(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** A hover index that still points at a bubble (areas may have changed under it). */
function validHover(i, bubbles) {
  return Number.isInteger(i) && i >= 0 && i < bubbles.length ? i : null;
}

/**
 * The hovered bubble's index, held with the area's name: it stays on that
 * area while the areas change under it (a playing time-lapse), and clears
 * once the index no longer holds that area or the area is not on the sky.
 */
function useSkyHover(areas) {
  const [held, setHeld] = useState(null);
  const setHover = useCallback((i) => setHeld(i === null ? null : { index: i, name: areas[i]?.name }), [areas]);
  const area = held ? areas[held.index] : null;
  return [area && area.name === held.name && !area.absent ? held.index : null, setHover];
}

/** Each zone's label for a set of rings: its name and count, and its width on the canvas. */
function useZoneText(measure) {
  return useCallback((rings) => {
    const counts = rings.counts || { fixFirst: 0, watch: 0 };
    const label = (key, count) => { const text = t(key, { count }); return { text, w: measure.zone(text) }; };
    return { fixFirst: label('map.riskZoneFixFirst', counts.fixFirst), watch: label('map.riskZoneWatch', counts.watch) };
  }, [measure]);
}

/** Paint both layers: the static bubbles, and the overlay with veil, ring and labels. */
function useSkyDrawing({ staticRef, overlayRef, scene, theme, size, hover, selected }) {
  const { frame, rings, bubbles, paints, files, labels, zoneLabels } = scene;
  const { palette, font, fontScale } = theme;
  useEffect(() => {
    const ctx = prepareLayer(staticRef.current, size);
    if (!ctx || !paints || !palette) return;
    drawSkyStatic(ctx, { frame, rings, bubbles, paints, files, palette, width: size.w, height: size.h, zoneLabels, font, fontScale });
  }, [staticRef, frame, rings, bubbles, paints, files, palette, size, zoneLabels, font, fontScale]);
  useEffect(() => {
    const ctx = prepareLayer(overlayRef.current, size);
    if (!ctx || !palette) return;
    const keepIndex = validHover(hover ?? selected, bubbles);
    drawSkyOverlay(ctx, { bubbles, keepIndex, hoverIndex: hover, labels, palette, font, fontScale, width: size.w, height: size.h });
  }, [overlayRef, bubbles, labels, hover, selected, palette, font, fontScale, size]);
}

/**
 * The Risk sky: a static layer of bubbles and an overlay with the veil, hover ring and labels.
 * `onSelect(index, byKeyboard)` is told whether the keyboard list chose the area;
 * `canvasRef`, when given, reaches the focusable overlay canvas.
 * `nodes` are positions aligned with `areas` and `rings` the line distances,
 * both given by the time-lapse; without them the sky lays itself out.
 * `label` names the canvas for assistive tech (the time-lapse gives the run's date).
 * Hover follows its area while the areas change under it (a playing time-lapse).
 */
export default function SkyCanvas({
  areas, average, dark, showLabels, selected, onSelect, onHover, labelText, canvasRef, nodes, rings, label,
}) {
  const staticRef = useRef(null);
  const ownOverlayRef = useRef(null);
  const overlayRef = canvasRef || ownOverlayRef;
  const size = useCanvasSize(overlayRef);
  const theme = useLayerTheme(overlayRef, dark);
  const [hover, setHover] = useSkyHover(areas);
  const measure = useMeasure(overlayRef, theme, { areas, labelText });
  const zoneText = useZoneText(measure);
  const scene = useSkyScene({ areas, average, palette: theme.palette, size, hover, selected, showLabels, measure, labelText, zoneText, nodes, rings });
  useSkyDrawing({ staticRef, overlayRef, scene, theme, size, hover, selected });

  const onMove = (e) => {
    const p = pointerAt(e);
    const i = pickBubble(scene.bubbles, p.x, p.y);
    setHover(i);
    onHover(i === null ? null : { index: i, x: p.x, y: p.y });
  };
  const onClick = (e) => {
    const p = pointerAt(e);
    onSelect(pickBubble(scene.bubbles, p.x, p.y));
  };
  const onKeyDown = (e) => {
    if (e.key === KEY.ESCAPE) {
      e.preventDefault();
      onSelect(null);
    } else if (e.key === KEY.ENTER || e.key === KEY.SPACE) {
      e.preventDefault();
      if (hover === null) focusFirstKeyboardItem(e.currentTarget);
      else onSelect(hover);
    }
  };
  const items = useMemo(() => kbdItems(areas, onSelect), [areas, onSelect]);
  return (
    <>
      <div style={WRAPPER_STYLE}>
        <canvas ref={staticRef} style={LAYER_STYLE} aria-hidden="true" />
        <canvas
          ref={overlayRef}
          style={{ ...LAYER_STYLE, cursor: hover === null ? 'default' : 'pointer' }}
          className="viz-focusable"
          tabIndex={0}
          role="img"
          aria-label={label || t('map.riskSkyAria')}
          onMouseMove={onMove}
          onMouseLeave={() => { setHover(null); onHover(null); }}
          onClick={onClick}
          onKeyDown={onKeyDown}
        />
      </div>
      <ChartKeyboardControls label={t('map.riskKbdLabel')} items={items} />
    </>
  );
}
