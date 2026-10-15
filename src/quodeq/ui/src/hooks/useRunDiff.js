import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext.jsx';
import { projectKeys } from '../api/queryKeys.js';
import { summariseDiff } from '../models/runDiff.js';

/**
 * One run compared with its baseline run (the run log's `baselineRunId`),
 * folded by `select` (summariseDiff by default); undefined without a
 * baseline or while it loads. Read by the History run log and the run page,
 * which share the cache entry.
 * @param {?string} project
 * @param {?{runId: string, baselineRunId: ?string}} run a run log entry
 * @param {(payload: object) => *} [select]
 */
export function useRunDiff(project, run, select = summariseDiff) {
  const api = useApi();
  return useQuery({
    queryKey: projectKeys.runDiff(project, run?.runId, run?.baselineRunId),
    queryFn: () => api.getRunDiff(project, run.runId, run.baselineRunId),
    enabled: Boolean(project && run?.baselineRunId),
    staleTime: Infinity, // a finished run against a fixed baseline never changes
    select,
    retry: false,
  }).data;
}
