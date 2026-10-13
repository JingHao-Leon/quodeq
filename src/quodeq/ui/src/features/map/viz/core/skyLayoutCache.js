// src/quodeq/ui/src/features/map/viz/core/skyLayoutCache.js
import { layoutSky } from './skyLayout.js';

/** How many recent sky layouts are kept, so a revisit of the Risk tab is free. */
export const SKY_LAYOUT_CACHE_SIZE = 4;
const FIELD_SEP = '\u0000';
const AREA_SEP = '\u0001';

/**
 * The inputs the layout depends on, as one string: name, density and file count per area.
 * @param {{name: string, density: number, stats: {files: number}}[]} areas
 * @returns {string}
 */
export function skyLayoutSignature(areas) {
  return areas.map((a) => [a.name, a.density, a.stats.files].join(FIELD_SEP)).join(AREA_SEP);
}

/**
 * A least-recently-used cache of sky layouts, keyed on the areas' signature.
 * The caller owns the instance, so its lifetime (and tests) are explicit.
 * @param {number} [limit] how many layouts to keep
 * @returns {{layout: function(object[]): object[], clear: function(): void}} `layout(areas)`
 *   returns a shared result that callers must not mutate
 */
export function createLayoutCache(limit = SKY_LAYOUT_CACHE_SIZE) {
  const recent = new Map();
  return {
    layout(areas) {
      const key = skyLayoutSignature(areas);
      const nodes = recent.get(key) || layoutSky(areas);
      recent.delete(key);
      recent.set(key, nodes);
      if (recent.size > limit) recent.delete(recent.keys().next().value);
      return nodes;
    },
    clear() { recent.clear(); },
  };
}
