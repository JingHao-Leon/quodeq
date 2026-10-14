import { request } from './request.js';
import { projectPath, sharedProjectPath } from './paths.js';
import { createPrincipleSeries } from '../models/principleSeries.js';

const seriesPath = (base, dimension) => `${base}/dimensions/${encodeURIComponent(dimension)}/principle-series`;

/** One dimension's per-principle score series of a local project, newest run first. */
export async function getPrincipleSeries(projectId, dimension) {
  return createPrincipleSeries(await request(seriesPath(projectPath(projectId), dimension)));
}

/** The same series from the shared clone. */
export async function sharedGetPrincipleSeries(projectId, dimension) {
  return createPrincipleSeries(await request(seriesPath(sharedProjectPath(projectId), dimension)));
}
