import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';

/**
 * The project's scores as of a past run (the same query, and cache entry, the
 * Overview uses when an older run is picked). A completed run's as-of scores
 * only change through explicit actions, which invalidate the project, so
 * they never go stale on their own. Disabled without `asOf`.
 */
export function useAsOfScores(project, source, asOf) {
  const api = useApi();
  return useQuery({
    queryKey: projectKeys.scores(project, asOf?.runId, source),
    queryFn: () => api.getProjectScores(project, asOf.runId),
    enabled: Boolean(project && asOf),
    staleTime: Infinity,
  });
}
