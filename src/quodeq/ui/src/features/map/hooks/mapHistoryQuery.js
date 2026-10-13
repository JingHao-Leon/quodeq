import { projectKeys } from '../../../api/queryKeys.js';
import { STALE_TIME_MS, refetchWhileError } from '../../../hooks/queryDefaults.js';
import { MAP_FRAMES } from '../mapVocab.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

/**
 * Whether the map history may be fetched: a local project whose view is on screen.
 * @param {string} project
 * @param {string} source a PROJECT_SOURCE value
 * @param {boolean} active
 * @returns {boolean}
 */
export function mapHistoryEnabled(project, source, active) {
  return Boolean(active) && Boolean(project) && source !== PROJECT_SOURCE.SHARED;
}

/**
 * The latest-frame map history query, shared by every Map view that reads it
 * (one key, one fetch); each caller adds its own `select`.
 * @param {{api: object, project: string, source: string, active: boolean}} args
 * @returns {object} useQuery options without `select`
 */
export function mapHistoryQuery({ api, project, source, active }) {
  return {
    queryKey: projectKeys.mapHistory(project, MAP_FRAMES.LATEST, source),
    queryFn: () => api.getMapHistory(project, MAP_FRAMES.LATEST),
    enabled: mapHistoryEnabled(project, source, active),
    staleTime: STALE_TIME_MS,
    retry: false,
    refetchInterval: refetchWhileError,
  };
}
