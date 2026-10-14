import { request } from './request.js';
import { projectPath } from './paths.js';

// Query parameters of a finding selection (see quodeq.api.routes_map_history).
const DIMENSIONS_PARAM = 'dimensions';
const PRINCIPLE_PARAM = 'principle';
const DIMENSIONS_SEP = ',';

/**
 * The map history URL of a local project (`frames`: 'latest' or 'all'),
 * measured over `selection` when one is given.
 * @param {string} projectId
 * @param {string} frames
 * @param {{dimensions: string[], principle?: string}|null} [selection] null: every finding
 * @returns {string}
 */
export function mapHistoryUrl(projectId, frames, selection = null) {
  const params = new URLSearchParams({ frames });
  if (selection) {
    params.set(DIMENSIONS_PARAM, selection.dimensions.join(DIMENSIONS_SEP));
    if (selection.principle) params.set(PRINCIPLE_PARAM, selection.principle);
  }
  return `${projectPath(projectId)}/map/history?${params}`;
}

/** Per-run map data for a local project (`frames`: 'latest' or 'all'), optionally over a finding selection. */
export function getMapHistory(projectId, frames, selection = null) {
  return request(mapHistoryUrl(projectId, frames, selection));
}
