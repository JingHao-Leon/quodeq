import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChartKeyboardControls from '../../../../components/ChartKeyboardControls.jsx';
import { useCanvasSize } from './galaxyCanvasSize.js';
import { prepareLayer, useLayerTheme } from './canvasLayer.js';
import { useSkyScene } from './useSkyScene.js';
import { pickBubble, drawSkyStatic, drawSkyOverlay } from '../core/skyLayers.js';
import { pluralKey } from '../../../../utils/plural.js';
import { t } from '../../../../strings/index.js';
import { KEY } from '../../../../vocab/keyboard.js';

const KBD_MAX = 100;
const WRAPPER_STYLE = { position: 'relative', width: '100%', height: '100%' };
const LAYER_STYLE = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };
const MEASURE_FONT_PX = 11.5;
const MEASURE_WEIGHT = 600;

function useMeasure(overlayRef, theme) {
  return useCallback((text) => {
    const ctx = overlayRef.current?.getContext('2d');
    if (!ctx) return 0;
    ctx.font = `${MEASURE_WEIGHT} ${MEASURE_FONT_PX * theme.fontScale}px ${theme.font}`;
    return ctx.measureText(text).width;
  }, [overlayRef, theme]);
}

function kbdItems(areas, onSelect) {
  return areas.map((a, i) => [a, i]).sort((p, q) => q[0].needPct - p[0].needPct).slice(0, KBD_MAX)
    .map(([a, i]) => ({
      key: a.name,
      text: t(pluralKey(a.stats.violations, 'map.riskAreaAriaOne', 'map.riskAreaAria'), { name: a.name, count: a.stats.violations }),
      onActivate: () => onSelect(i),
    }));
}

function pointerAt(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** A hover index that still points at a bubble (areas may have changed under it). */
function validHover(i, bubbles) {
  return Number.isInteger(i) && i >= 0 && i < bubbles.length ? i : null;
}

/** Paint both layers: the static bubbles, and the overlay with veil, ring and labels. */
function useSkyDrawing({ staticRef, overlayRef, scene, theme, size, hover, selected }) {
  const { frame, bubbles, paints, files, labels } = scene;
  const { palette, font, fontScale } = theme;
  useEffect(() => {
    const ctx = prepareLayer(staticRef.current, size);
    if (ctx && paints && palette) drawSkyStatic(ctx, { frame, bubbles, paints, files, palette, width: size.w, height: size.h });
  }, [staticRef, frame, bubbles, paints, files, palette, size]);
  useEffect(() => {
    const ctx = prepareLayer(overlayRef.current, size);
    if (!ctx || !palette) return;
    const keepIndex = validHover(hover ?? selected, bubbles);
    drawSkyOverlay(ctx, { bubbles, keepIndex, hoverIndex: hover, labels, palette, font, fontScale, width: size.w, height: size.h });
  }, [overlayRef, bubbles, labels, hover, selected, palette, font, fontScale, size]);
}

/** The Risk sky: a static layer of bubbles and an overlay with the veil, hover ring and labels. */
export default function SkyCanvas({ areas, average, dark, showLabels, selected, onSelect, onHover, labelText }) {
  const staticRef = useRef(null);
  const overlayRef = useRef(null);
  const size = useCanvasSize(overlayRef);
  const theme = useLayerTheme(overlayRef, dark);
  const [rawHover, setHover] = useState(null);
  useEffect(() => { setHover(null); }, [areas]);
  const measureText = useMeasure(overlayRef, theme);
  const measure = useCallback((i) => measureText(labelText(areas[i]).title), [measureText, labelText, areas]);
  const hover = rawHover !== null && rawHover < areas.length ? rawHover : null;
  const scene = useSkyScene({ areas, average, palette: theme.palette, size, hover, selected, showLabels, measure, labelText });
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
    if (e.key !== KEY.ESCAPE) return;
    e.preventDefault();
    onSelect(null);
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
          aria-label={t('map.riskSkyAria')}
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
