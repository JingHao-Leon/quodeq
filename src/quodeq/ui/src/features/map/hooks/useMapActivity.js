import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { STALE_TIME_MS } from '../../../hooks/queryDefaults.js';
import { MAP_FRAMES } from '../mapVocab.js';
import { decodeActivity, NO_ACTIVITY } from '../model/mapActivity.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

/**
 * Per-file edit counts for the Activity colour mode. Local projects only:
 * shared projects have no local runs, so they never fetch.
 * @returns {{activity: {source: string, editsByPath: Map<string, number>}, loading: boolean, failed: boolean}}
 */
export default function useMapActivity(project, source) {
  const api = useApi();
  const enabled = Boolean(project) && source !== PROJECT_SOURCE.SHARED;
  const query = useQuery({
    queryKey: projectKeys.mapHistory(project, MAP_FRAMES.LATEST, source),
    queryFn: () => api.getMapHistory(project, MAP_FRAMES.LATEST),
    enabled,
    staleTime: STALE_TIME_MS,
    retry: false,
    select: decodeActivity,
  });
  return { activity: query.data || NO_ACTIVITY, loading: enabled && query.isPending, failed: query.isError };
}
