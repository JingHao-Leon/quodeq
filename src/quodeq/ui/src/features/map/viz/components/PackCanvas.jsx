import { useEffect, useMemo, useRef } from 'react';
import ChartKeyboardControls from '../../../../components/ChartKeyboardControls.jsx';
import { useCanvasSize } from './galaxyCanvasSize.js';
import { prepareLayer, useLayerTheme, KBD_MAX, WRAPPER_STYLE, LAYER_STYLE } from './canvasLayer.js';
import { drawStatic, drawOverlay } from '../core/packLayers.js';
import { packViewport, toLayoutPoint, hitCircle, screenCoordsFor } from '../core/packCanvasGeometry.js';
import { useTweenedTransform } from '../core/packTween.js';
import { buildPackPaint } from '../core/packPaint.js';
import { pickUnderPointer, keepCircle } from '../core/packPick.js';
import { packStateText } from '../core/packStateText.js';
import { t } from '../../../../strings/index.js';
import { KEY } from '../../../../vocab/keyboard.js';

const NO_EVENT = { stopPropagation() {} };

function usePackPaint({ circles, colorMode, palette, weights, editsByPath }) {
  return useMemo(() => {
    const root = circles.find((c) => c.depth === 0);
    if (!palette || !root) return null;
    return buildPackPaint({ root, circles, mode: colorMode, palette, weights, editsByPath });
  }, [circles, colorMode, palette, weights, editsByPath]);
}

function useStaticLayer(canvasRef, { circles, indexOf, paint, screenCoords, viewport, size }) {
  useEffect(() => {
    if (!paint) return;
    const ctx = prepareLayer(canvasRef.current, size);
    if (ctx) drawStatic(ctx, { circles, screenCoords, viewport, paint, index: indexOf, width: size.w, height: size.h });
  }, [canvasRef, circles, indexOf, paint, screenCoords, viewport, size]);
}

function useOverlayLayer(canvasRef, frame) {
  const { circles, screenCoords, viewport, keepIndex, hoverIndex, focusNode, showLabels, theme, size } = frame;
  useEffect(() => {
    if (!theme.palette) return;
    const ctx = prepareLayer(canvasRef.current, size);
    if (!ctx) return;
    drawOverlay(ctx, {
      circles, screenCoords, viewport, keepIndex, hoverIndex, focusNode, showLabels,
      palette: theme.palette, font: theme.font, fontScale: theme.fontScale, width: size.w, height: size.h,
    });
  }, [canvasRef, circles, screenCoords, viewport, keepIndex, hoverIndex, focusNode, showLabels, theme, size]);
}

function kbdItems({ circles, paint, focusNode, colorMode, handleClick }) {
  const items = [];
  for (let i = 0; i < circles.length && items.length < KBD_MAX; i++) {
    const c = circles[i];
    if (c.parent !== focusNode) continue;
    const name = c.data.name || c.data.path;
    items.push({
      key: c.data.path || String(i),
      text: paint ? t('map.nodeStateAria', { name, state: packStateText(paint[i], colorMode) }) : name,
      onActivate: () => handleClick(NO_EVENT, c),
    });
  }
  return items;
}

/** The hover index the layers may draw: null for "no circle", and never an
 * index past `circles` (a hover left over from an earlier tree). */
function validIndex(i, circles) {
  return Number.isInteger(i) && i >= 0 && i < circles.length ? i : null;
}

/**
 * Pointer handling: a hit selects the deepest circle under the pointer, at
 * any depth, so a click goes straight to a nested folder or file. A miss goes
 * to the parent; a hit on the open folder itself does nothing.
 */
function usePointer({ overlayRef, circles, screenCoords, viewport, focusNode, indexOf, hover, setHover, handleClick, handleBgClick }) {
  const hitAt = (e) => {
    const r = overlayRef.current.getBoundingClientRect();
    const p = toLayoutPoint(e.clientX - r.left, e.clientY - r.top, viewport);
    const i = hitCircle(circles, screenCoords, p.x, p.y);
    return i === null ? null : circles[i];
  };
  const onMouseMove = (e) => {
    const picked = pickUnderPointer(hitAt(e), focusNode);
    const i = picked ? indexOf.get(picked) : null;
    if (i !== hover) setHover(i);
  };
  const onClick = (e) => {
    const hit = hitAt(e);
    if (hit === focusNode) return;
    const picked = pickUnderPointer(hit, focusNode);
    if (picked) handleClick(e, picked);
    else handleBgClick();
  };
  const onKeyDown = (e) => {
    if (e.key !== KEY.ESCAPE) return;
    e.preventDefault();
    handleBgClick();
  };
  return { onMouseMove, onClick, onKeyDown, onMouseLeave: () => setHover(null) };
}

/**
 * The pack on two stacked canvases: a static layer with every circle,
 * redrawn when the paint or the zoom changes, and an overlay with the
 * dimming veil, the hover ring and the labels, redrawn on hover. `transform`
 * is the focus target; the layers tween toward it. Only the overlay takes
 * pointer and keyboard events; keyboard users also get a focusable button
 * per child of the open folder (ChartKeyboardControls).
 *
 * Props are grouped: `view` (circles, transform, skipTransition, focusNode,
 * showLabels), `paintInputs` (colorMode, weights, editsByPath, dark),
 * `hoverState` (hover, setHover) and `handlers` (handleClick, handleBgClick).
 */
export default function PackCanvas({ view, paintInputs, hoverState, handlers }) {
  const { circles, transform, skipTransition, focusNode, showLabels } = view;
  const { colorMode, weights, editsByPath, dark } = paintInputs;
  const { hover, setHover } = hoverState;
  const { handleClick, handleBgClick } = handlers;
  const staticRef = useRef(null);
  const overlayRef = useRef(null);
  const size = useCanvasSize(overlayRef);
  const viewport = useMemo(() => packViewport(size.w, size.h), [size.w, size.h]);
  // Hit tests use what is on screen right now, mid-tween included.
  const shown = useTweenedTransform(transform, skipTransition);
  const screenCoords = useMemo(() => screenCoordsFor(circles, shown), [circles, shown]);
  const indexOf = useMemo(() => new Map(circles.map((c, i) => [c, i])), [circles]);
  const theme = useLayerTheme(overlayRef, dark);
  const paint = usePackPaint({ circles, colorMode, palette: theme.palette, weights, editsByPath });
  const hoverIndex = validIndex(hover, circles);
  const keep = keepCircle(hoverIndex === null ? null : circles[hoverIndex], focusNode);

  useStaticLayer(staticRef, { circles, indexOf, paint, screenCoords, viewport, size });
  useOverlayLayer(overlayRef, {
    circles, screenCoords, viewport, focusNode, theme, size, hoverIndex,
    keepIndex: keep ? indexOf.get(keep) ?? null : null,
    showLabels: showLabels && shown === transform,
  });
  const kbd = useMemo(
    () => kbdItems({ circles, paint, focusNode, colorMode, handleClick }),
    [circles, paint, focusNode, colorMode, handleClick],
  );
  const pointer = usePointer({ overlayRef, circles, screenCoords, viewport, focusNode, indexOf, hover: hoverIndex, setHover, handleClick, handleBgClick });

  return (
    <>
      <div style={WRAPPER_STYLE}>
        <canvas ref={staticRef} aria-hidden="true" style={LAYER_STYLE} />
        <canvas
          ref={overlayRef}
          className="viz-focusable"
          tabIndex={0}
          aria-label={t('map.zoomablePackAria')}
          style={{ ...LAYER_STYLE, cursor: hoverIndex === null ? 'default' : 'pointer' }}
          {...pointer}
        />
      </div>
      <ChartKeyboardControls label={t('map.packKbdLabel')} items={kbd} />
    </>
  );
}
