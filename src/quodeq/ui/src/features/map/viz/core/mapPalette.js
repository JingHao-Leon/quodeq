/** The tokens the pack paints with, by palette key. */
export const MAP_PALETTE_TOKENS = Object.freeze({
  bg: '--color-bg',
  surfaceAlt: '--color-surface-alt',
  text: '--color-text',
  border: '--color-border',
  worse: '--color-map-worse',
  better: '--color-map-better',
  neutral: '--color-map-neutral',
  activity: '--color-map-activity',
  activityIdle: '--color-map-activity-idle',
  glassParent: '--color-map-glass-parent',
});

/**
 * Read the pack palette from a computed style. `parseColor` turns any CSS
 * colour (hex, rgb(), color-mix()) into `{r,g,b}`; the canvas-backed
 * `parseCSSColor` from galaxyCore.js in the app, a stub in tests.
 * @param {CSSStyleDeclaration} style
 * @param {(css: string) => {r:number,g:number,b:number}} parseColor
 * @param {boolean} dark
 */
export function readMapPalette(style, parseColor, dark) {
  const palette = { dark };
  for (const [key, token] of Object.entries(MAP_PALETTE_TOKENS)) {
    palette[key] = parseColor(style.getPropertyValue(token).trim());
  }
  return palette;
}
