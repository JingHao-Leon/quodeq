import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { runsFromTrend } from './runLogModel.js';

export const RUN_LOG_POLL_MS = 2000;
const RUN_LOG_STALE_MS = 10000;
const NO_RUNS = [];

/** The project's run log. Polls while counts are pending or a run is going. */
export function useRunLog(project) {
  const api = useApi();
  const q = useQuery({
    queryKey: projectKeys.runLog(project),
    queryFn: () => api.getRunLog(project),
    enabled: Boolean(project),
    staleTime: RUN_LOG_STALE_MS,
    refetchInterval: (query) => (
      query.state.data?.runs?.some((r) => r.pending) || query.state.data?.running ? RUN_LOG_POLL_MS : false
    ),
  });
  return {
    runs: q.data?.runs || NO_RUNS,
    running: q.data?.running || null,
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  };
}

const NO_REFETCH = () => {};

/**
 * A remote project's run log, built from the dashboard data the page already
 * holds: remote projects have no run log endpoint, so nothing is fetched.
 */
export function useSharedRunLog(trend, partialRuns) {
  const runs = useMemo(() => runsFromTrend(trend, partialRuns), [trend, partialRuns]);
  return { runs, running: null, loading: false, error: null, refetch: NO_REFETCH };
}
