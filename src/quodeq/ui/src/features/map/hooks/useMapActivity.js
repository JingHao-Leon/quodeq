import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { decodeActivity, NO_ACTIVITY } from '../model/mapActivity.js';
import { mapHistoryQuery, mapHistoryEnabled } from './mapHistoryQuery.js';

/**
 * Per-file edit counts for the Activity colour mode, from the project's own
 * source (a shared project's from the shared clone). The history is
 * fetched only while the Circle Pack is the active view (`active`). A failed
 * fetch keeps retrying on the error interval, so it recovers in-session
 * (the webview never refetches an errored query on focus).
 * @param {string} project
 * @param {string} source a PROJECT_SOURCE value
 * @param {boolean} [active=true] the Circle Pack is the view on screen
 * @returns {{activity: {source: string, editsByPath: Map<string, number>}, loading: boolean, failed: boolean}}
 */
export default function useMapActivity(project, source, active = true) {
  const api = useApi();
  const query = useQuery({ ...mapHistoryQuery({ api, project, source, active }), select: decodeActivity });
  const enabled = mapHistoryEnabled(project, active);
  return { activity: query.data || NO_ACTIVITY, loading: enabled && query.isPending, failed: query.isError };
}
