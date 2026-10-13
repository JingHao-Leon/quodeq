import { useMemo } from 'react';
import { cachedLayoutSky } from '../core/skyLayoutCache.js';
import { packAreaFiles } from '../core/skyMiniPack.js';
import { skyAreaPaint, dotColor } from '../core/skyPaint.js';
import { skyFrame, toPixels } from '../core/skyLayers.js';
import { chooseLabelled, mustLabelled, placeSkyLabels } from '../core/skyLabels.js';

const isIndex = (i) => i !== null && i !== undefined;

/** Layout and file packs depend only on the areas; colours on the palette too. */
function useSkyModel(areas, average, palette) {
  const nodes = useMemo(() => cachedLayoutSky(areas), [areas]);
  const packs = useMemo(() => areas.map((a) => packAreaFiles(a.dots)), [areas]);
  const paints = useMemo(() => (palette ? areas.map((a) => skyAreaPaint(a, average, palette)) : null), [areas, average, palette]);
  const files = useMemo(
    () => (palette ? areas.map((a, i) => ({ dots: packs[i], colors: a.dots.map((d) => dotColor(d.worst, palette)) })) : null),
    [areas, packs, palette],
  );
  return { nodes, paints, files };
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
 * Everything the sky draws, memoised per input: layout, file packs, paints,
 * pixel bubbles for the canvas size, and placed labels.
 */
export function useSkyScene({ areas, average, palette, size, hover, selected, showLabels, measure, labelText }) {
  const { nodes, paints, files } = useSkyModel(areas, average, palette);
  const frame = useMemo(() => skyFrame(size.w, size.h), [size.w, size.h]);
  const bubbles = useMemo(() => toPixels(nodes, frame), [nodes, frame]);
  const labels = useSkyLabels({ areas, bubbles, hover, selected, showLabels, measure, labelText });
  return { frame, bubbles, paints, files, labels };
}
