import { request } from './request.js';
import { projectPath, sharedProjectPath } from './paths.js';

// Query parameters of a finding selection (see quodeq.api.routes_map_history).
const DIMENSIONS_PARAM = 'dimensions';
const PRINCIPLE_PARAM = 'principle';
const DIMENSIONS_SEP = ',';

/**
 * The map history URL of a local project (`frames`: 'latest' or 'all'),
 * measured over `selection` when one is given; `base` is the project's API
 * path (the shared clone's for a shared project).
 * @param {string} projectId
 * @param {string} frames
 * @param {{dimensions: string[], principle?: string}|null} [selection] null: every finding
 * @param {string} [base]
 * @returns {string}
 */
export function mapHistoryUrl(projectId, frames, selection = null, base = projectPath(projectId)) {
  const params = new URLSearchParams({ frames });
  if (selection) {
    params.set(DIMENSIONS_PARAM, selection.dimensions.join(DIMENSIONS_SEP));
    if (selection.principle) params.set(PRINCIPLE_PARAM, selection.principle);
  }
  return `${base}/map/history?${params}`;
}

/** Per-run map data for a local project (`frames`: 'latest' or 'all'), optionally over a finding selection. */
export function getMapHistory(projectId, frames, selection = null) {
  return request(mapHistoryUrl(projectId, frames, selection));
}

/** The same history from the shared clone. */
export function sharedGetMapHistory(projectId, frames, selection = null) {
  return request(mapHistoryUrl(projectId, frames, selection, sharedProjectPath(projectId)));
}
