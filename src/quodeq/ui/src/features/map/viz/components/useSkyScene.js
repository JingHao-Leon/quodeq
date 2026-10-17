import { useMemo } from 'react';
import { createLayoutCache } from '../core/skyLayoutCache.js';
import { skyRings } from '../core/skyScale.js';
import { packAreaFiles } from '../core/skyMiniPack.js';
import { skyAreaPaint, fileDotColor } from '../core/skyPaint.js';
import { skyFrame, toPixels, placeZoneLabels } from '../core/skyLayers.js';
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

function useSkyLabels({ areas, bubbles, hover, selected, showLabels, measure, labelText, reserved }) {
  return useMemo(() => {
    // Labels off: no label at all (hover keeps its popup), as on the Circle Pack.
    if (!showLabels) return [];
    const inRange = (i) => isIndex(i) && i >= 0 && i < bubbles.length;
    const placeable = areas.slice(0, bubbles.length);
    const picks = { areas: placeable, hovered: inRange(hover) ? hover : null, selected: inRange(selected) ? selected : null };
    // An area the run does not have (time-lapse) is never labelled.
    const shown = (set) => new Set([...set].filter((i) => !placeable[i].absent));
    const must = shown(mustLabelled({ ...picks, showLabels }));
    const wanted = shown(chooseLabelled(picks));
    const placed = placeSkyLabels({ bubbles, wanted, must, measure, reserved, first: picks.selected, priority: (i) => areas[i].density || 0 });
    return placed.map((p) => ({ ...p, ...labelText(areas[p.index]) }));
  }, [areas, bubbles, hover, selected, showLabels, measure, labelText, reserved]);
}

/**
 * Everything the sky draws, memoised per input: layout, rings, file packs, paints,
 * pixel bubbles for the canvas size, and placed labels. `nodes` (aligned with
 * `areas`) and `rings`, when given, are used as they are instead of laying out.
 */
export function useSkyScene({ areas, average, palette, size, hover, selected, showLabels, measure, labelText, zoneText, nodes: givenNodes, rings: givenRings }) {
  const { nodes, rings, paints, files } = useSkyModel(areas, average, palette, { nodes: givenNodes, rings: givenRings });
  const frame = useMemo(() => skyFrame(size.w, size.h), [size.w, size.h]);
  const bubbles = useMemo(() => toPixels(nodes, frame), [nodes, frame]);
  const zoneLabels = useMemo(
    () => (showLabels ? placeZoneLabels(frame, rings, zoneText(rings), measure.fontScale) : []),
    [frame, rings, zoneText, measure, showLabels],
  );
  const reserved = useMemo(() => zoneLabels.map((z) => z.box), [zoneLabels]);
  const labels = useSkyLabels({ areas, bubbles, hover, selected, showLabels, measure: measure.area, labelText, reserved });
  return { frame, rings, bubbles, paints, files, labels, zoneLabels };
}
