import { projectKeys } from '../../../api/queryKeys.js';
import { STALE_TIME_MS, refetchWhileError } from '../../../hooks/queryDefaults.js';
import { HTTP_STATUS } from '../../../constants.js';
import { MAP_FRAMES } from '../mapVocab.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { selectionKey } from '../model/riskSelection.js';

/**
 * Whether the map history may be fetched: a project whose view is on screen.
 * @param {string} project
 * @param {boolean} active
 * @returns {boolean}
 */
export function mapHistoryEnabled(project, active) {
  return Boolean(active) && Boolean(project);
}

/**
 * Re-ask while the history errors, except when the server refused the
 * request itself (a selection it does not know): asking again cannot help.
 * @param {{state: {error: ?{status?: number}}}} query
 * @returns {number|false} the next refetch in ms, or false for none
 */
export function refetchUnlessRefused(query) {
  return query.state.error?.status === HTTP_STATUS.BAD_REQUEST ? false : refetchWhileError(query);
}

/** The history from the project's own source: a shared project's from the shared clone. Every finding keeps the two-argument call. */
function fetchMapHistory(api, { project, source, frames, selection }) {
  const get = source === PROJECT_SOURCE.SHARED ? api.sharedGetMapHistory : api.getMapHistory;
  return selection ? get(project, frames, selection) : get(project, frames);
}

/**
 * The map history query, shared by every Map view that reads it (one key per
 * frames mode and selection, one fetch); each caller adds its own `select`.
 * The latest-frame history by default; the time-lapse asks for every frame.
 * A `selection` (riskSelection.js) measures it over those findings only.
 * @param {{api: object, project: string, source: string, active: boolean, frames?: string, selection?: object|null}} args
 * @returns {object} useQuery options without `select`
 */
export function mapHistoryQuery({ api, project, source, active, frames = MAP_FRAMES.LATEST, selection = null }) {
  return {
    queryKey: projectKeys.mapHistory(project, frames, source, selectionKey(selection)),
    queryFn: () => fetchMapHistory(api, { project, source, frames, selection }),
    enabled: mapHistoryEnabled(project, active),
    staleTime: STALE_TIME_MS,
    retry: false,
    refetchInterval: refetchUnlessRefused,
  };
}
