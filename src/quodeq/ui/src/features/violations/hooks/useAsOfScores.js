import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { refetchWhilePendingOrError } from '../../../hooks/queryDefaults.js';
import { isPendingPayload } from '../../../api/scoresShape.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

/**
 * The project's scores as of a past run (the same query, and cache entry, the
 * Overview uses when an older run is picked). A completed run's as-of scores
 * only change through explicit actions, which invalidate the project, so
 * they never go stale on their own. Disabled without `asOf`. While the
 * server still owes the payload (its pending body) the query polls and
 * counts as loading, as the Overview's does.
 */
export function useAsOfScores(project, source, asOf) {
  const api = useApi();
  const query = useQuery({
    queryKey: projectKeys.scores(project, asOf?.runId, source),
    queryFn: () => api.getProjectScores(project, asOf.runId),
    enabled: Boolean(project && asOf),
    staleTime: Infinity,
    refetchInterval: refetchWhilePendingOrError,
  });
  const pending = isPendingPayload(query.data);
  return { ...query, data: pending ? undefined : query.data, isLoading: query.isLoading || pending };
}

/** Today's findings, or a past day's (`asOf`) read as of that day's last run. */
export function useShownData(data) {
  const { selectedProject, selectedSource = PROJECT_SOURCE.LOCAL, asOf = null } = data;
  const past = useAsOfScores(selectedProject, selectedSource, asOf);
  if (!asOf) return data;
  return {
    ...data,
    accumulatedDimensions: past.data?.accumulated?.dimensions || [],
    loading: past.isLoading,
    isFetching: past.isFetching,
    error: past.error || null,
  };
}
