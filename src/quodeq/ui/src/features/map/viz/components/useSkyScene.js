import { useMemo } from 'react';
import { createLayoutCache } from '../core/skyLayoutCache.js';
import { skyRings } from '../core/skyLayout.js';
import { packAreaFiles } from '../core/skyMiniPack.js';
import { skyAreaPaint, fileDotColor } from '../core/skyPaint.js';
import { skyFrame, toPixels } from '../core/skyLayers.js';
import { chooseLabelled, mustLabelled, placeSkyLabels } from '../core/skyLabels.js';

/** One cache for the app, so Back from the circle pack finds the sky already laid out. */
export const skyLayoutCache = createLayoutCache();

const isIndex = (i) => i !== null && i !== undefined;

/**
 * Layout, rings and file packs depend only on the areas; colours on the palette and average too.
 * `given` nodes and rings (the time-lapse's) replace the sky's own layout and rings.
 */
function useSkyModel(areas, average, palette, given) {
  const { nodes: givenNodes, rings: givenRings } = given;
  const laid = useMemo(() => (givenNodes ? null : skyLayoutCache.layout(areas)), [areas, givenNodes]);
  const ownRings = useMemo(() => (givenRings ? null : skyRings(areas)), [areas, givenRings]);
  const nodes = givenNodes || laid;
  const rings = givenRings || ownRings;
  const packs = useMemo(() => areas.map((a) => packAreaFiles(a.dots)), [areas]);
  const paints = useMemo(() => (palette ? areas.map((a) => skyAreaPaint(a, average, palette)) : null), [areas, average, palette]);
  const files = useMemo(
    () => (palette ? areas.map((a, i) => ({ dots: packs[i], colors: a.dots.map((d) => fileDotColor(d.stats, average, palette)) })) : null),
    [areas, packs, average, palette],
  );
  return { nodes, rings, paints, files };
}

function useSkyLabels({ areas, bubbles, hover, selected, showLabels, measure, labelText }) {
  return useMemo(() => {
    const inRange = (i) => isIndex(i) && i >= 0 && i < bubbles.length;
    const placeable = areas.slice(0, bubbles.length);
    const picks = { areas: placeable, hovered: inRange(hover) ? hover : null, selected: inRange(selected) ? selected : null };
    const must = mustLabelled({ ...picks, showLabels });
    const wanted = showLabels ? chooseLabelled(picks) : must;
    const placed = placeSkyLabels({ bubbles, wanted, must, measure });
    return placed.map((p) => ({ ...p, ...labelText(areas[p.index]) }));
  }, [areas, bubbles, hover, selected, showLabels, measure, labelText]);
}

/**
 * Everything the sky draws, memoised per input: layout, rings, file packs, paints,
 * pixel bubbles for the canvas size, and placed labels. `nodes` (aligned with
 * `areas`) and `rings`, when given, are used as they are instead of laying out.
 */
export function useSkyScene({ areas, average, palette, size, hover, selected, showLabels, measure, labelText, nodes: givenNodes, rings: givenRings }) {
  const { nodes, rings, paints, files } = useSkyModel(areas, average, palette, { nodes: givenNodes, rings: givenRings });
  const frame = useMemo(() => skyFrame(size.w, size.h), [size.w, size.h]);
  const bubbles = useMemo(() => toPixels(nodes, frame), [nodes, frame]);
  const labels = useSkyLabels({ areas, bubbles, hover, selected, showLabels, measure, labelText });
  return { frame, rings, bubbles, paints, files, labels };
}
