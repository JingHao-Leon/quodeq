import { useEffect, useState } from 'react';
import { readMapPalette } from '../core/mapPalette.js';
import { parseCSSColor } from '../core/galaxyCore.js';

const FONT_TOKEN = '--font-sans';

/** Keyboard stand-ins per canvas view, capped like the galaxy views. */
export const KBD_MAX = 100;
/** The positioned box that stacks a view's canvas layers. */
export const WRAPPER_STYLE = { position: 'relative', width: '100%', height: '100%' };
/** One canvas layer filling the wrapper. */
export const LAYER_STYLE = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };
// The root font size the canvas label bounds were designed for.
const BASE_ROOT_PX = 16;

/** Size a layer's backing store for the device pixel ratio (only when it
 * changed: assigning `width` clears the canvas) and return its context. */
export function prepareLayer(canvas, size) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(size.w * dpr);
  const h = Math.round(size.h * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Palette and label font, read after commit: the Map container's theme
 * attribute flips in the same commit as `dark`, so only then do the tokens
 * resolve to the new theme. Without a 2D context there is nothing to paint
 * (and no way to parse a colour), so the palette stays unread. */
export function useLayerTheme(canvasRef, dark) {
  const [theme, setTheme] = useState({ palette: null, font: '', fontScale: 1 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el?.getContext('2d')) return;
    const style = getComputedStyle(el);
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || BASE_ROOT_PX;
    setTheme({ palette: readMapPalette(style, parseCSSColor, dark), font: style.getPropertyValue(FONT_TOKEN).trim(), fontScale: rootPx / BASE_ROOT_PX });
  }, [canvasRef, dark]);
  return theme;
}
