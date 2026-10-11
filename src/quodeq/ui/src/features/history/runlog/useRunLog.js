import { useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { runsFromTrend } from './runLogModel.js';

export const RUN_LOG_POLL_MS = 2000;
// About three minutes of polls that change nothing: a run stuck pending (or
// a job that never reports an end) must not poll forever.
export const RUN_LOG_MAX_IDLE_POLLS = 90;
const RUN_LOG_STALE_MS = 10000;
const NO_RUNS = [];

/** What polling waits on: the pending runs and the running job, or null. */
function pendingKey(data) {
  const pending = (data?.runs || []).filter((r) => r.pending).map((r) => r.runId);
  if (!pending.length && !data?.running) return null;
  return `${pending.join(',')}|${data?.running?.jobId || ''}`;
}

const freshBudget = () => ({ key: null, idle: 0, seenAt: 0 });

/**
 * The poll interval: every RUN_LOG_POLL_MS while something is pending, off
 * after RUN_LOG_MAX_IDLE_POLLS reads in a row with the same pending set.
 */
function usePollInterval() {
  const budget = useRef(freshBudget());
  const interval = useCallback((query) => {
    const key = pendingKey(query.state.data);
    const b = budget.current;
    if (!key) {
      budget.current = freshBudget();
      return false;
    }
    if (query.state.dataUpdatedAt !== b.seenAt) {
      b.seenAt = query.state.dataUpdatedAt;
      b.idle = key === b.key ? b.idle + 1 : 0;
      b.key = key;
    }
    return b.idle >= RUN_LOG_MAX_IDLE_POLLS ? false : RUN_LOG_POLL_MS;
  }, []);
  const reset = useCallback(() => { budget.current = freshBudget(); }, []);
  return { interval, reset };
}

/** The project's run log. Polls while counts are pending or a run is going. */
export function useRunLog(project) {
  const api = useApi();
  const { interval, reset } = usePollInterval();
  const q = useQuery({
    queryKey: projectKeys.runLog(project),
    queryFn: () => api.getRunLog(project),
    enabled: Boolean(project),
    staleTime: RUN_LOG_STALE_MS,
    refetchInterval: interval,
  });
  const { refetch: queryRefetch } = q;
  // A manual read restarts a poll that gave up.
  const refetch = useCallback(() => { reset(); return queryRefetch(); }, [reset, queryRefetch]);
  return {
    runs: q.data?.runs || NO_RUNS,
    running: q.data?.running || null,
    loading: q.isLoading,
    error: q.error,
    refetch,
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
