import { request } from './request.js';
import { projectPath } from './paths.js';

/** The History run log: every run with its comparison counts, plus the running job. */
export function getRunLog(projectId) {
  return request(`${projectPath(projectId)}/runs/log`);
}
