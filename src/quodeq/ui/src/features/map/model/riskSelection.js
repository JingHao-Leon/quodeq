/**
 * The finding selection a Risk sky is measured over: some dimensions, or one
 * principle of one dimension (GET /map/history `dimensions` and `principle`).
 * null is every finding, the history every other Map view reads.
 */

const KEY_SEP = '|';
const DIMENSIONS_SEP = ',';

/**
 * The selection of `dimensions` (sorted), narrowed to `principle` when it
 * names one; null without a dimension.
 * @param {string[]} dimensions
 * @param {string} [principle]
 * @returns {{dimensions: string[], principle: string}|null}
 */
export function selectionOf(dimensions, principle = '') {
  if (!dimensions?.length) return null;
  return { dimensions: [...dimensions].sort(), principle: principle || '' };
}

/**
 * The Risk tab's selection: the dimensions the Map's Dimensions filter keeps,
 * narrowed to `principle` while the filter keeps exactly its dimension. Every
 * dimension kept and no principle is no selection (null).
 * @param {{allDimensions: string[], selectedDimensions: Set<string>, principle?: {dimension: string, name: string}|null}} filter
 * @returns {{dimensions: string[], principle: string}|null}
 */
export function riskSelection({ allDimensions, selectedDimensions, principle = null }) {
  const dimensions = allDimensions.filter((d) => selectedDimensions.has(d));
  const narrowed = principle && dimensions.length === 1 && dimensions[0] === principle.dimension ? principle.name : '';
  if (!narrowed && dimensions.length === allDimensions.length) return null;
  return selectionOf(dimensions, narrowed);
}

/**
 * The query-key segment of a selection; null for every finding.
 * @param {{dimensions: string[], principle?: string}|null} selection
 * @returns {string|null}
 */
export function selectionKey(selection) {
  return selection ? `${selection.dimensions.join(DIMENSIONS_SEP)}${KEY_SEP}${selection.principle || ''}` : null;
}

/**
 * The principle a Map nav entry opens on: `principle` with its single
 * dimension; null without one, or with other than exactly one dimension.
 * @param {{dimensions?: string[], principle?: string}|null} nav
 * @returns {{dimension: string, name: string}|null}
 */
export function navPrinciple(nav) {
  const dims = nav?.dimensions;
  return nav?.principle && dims?.length === 1 ? { dimension: dims[0], name: nav.principle } : null;
}
