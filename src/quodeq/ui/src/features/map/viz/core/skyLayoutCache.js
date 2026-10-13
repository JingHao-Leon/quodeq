// src/quodeq/ui/src/features/map/viz/core/skyLayoutCache.js
import { layoutSky } from './skyLayout.js';

/** How many recent sky layouts are kept, so a revisit of the Risk tab is free. */
export const SKY_LAYOUT_CACHE_SIZE = 4;
const FIELD_SEP = '\u0000';
const AREA_SEP = '\u0001';

const recent = new Map();

/**
 * The inputs the layout depends on, as one string: name, need and file count per area.
 * @param {{name: string, needPct: number, stats: {files: number}}[]} areas
 * @returns {string}
 */
export function skyLayoutSignature(areas) {
  return areas.map((a) => [a.name, a.needPct, a.stats.files].join(FIELD_SEP)).join(AREA_SEP);
}

/**
 * `layoutSky(areas)`, memoised on the areas' signature across mounts. Keeps
 * the last SKY_LAYOUT_CACHE_SIZE layouts, dropping the least recently used.
 * @param {{name: string, needPct: number, stats: {files: number}}[]} areas
 * @returns {{x: number, y: number, r: number}[]} shared result; callers must not mutate it
 */
export function cachedLayoutSky(areas) {
  const key = skyLayoutSignature(areas);
  const hit = recent.get(key);
  recent.delete(key);
  const nodes = hit || layoutSky(areas);
  recent.set(key, nodes);
  if (recent.size > SKY_LAYOUT_CACHE_SIZE) recent.delete(recent.keys().next().value);
  return nodes;
}
