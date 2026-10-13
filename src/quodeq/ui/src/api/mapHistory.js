import { request } from './request.js';
import { projectPath } from './paths.js';

/** Per-run map data for a local project (`frames`: 'latest' or 'all'). */
export function getMapHistory(projectId, frames) {
  return request(`${projectPath(projectId)}/map/history?frames=${encodeURIComponent(frames)}`);
}
