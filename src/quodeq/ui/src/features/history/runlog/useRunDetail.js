import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { summariseDiff, summariseThroughput } from './runLogModel.js';

/** One run's diff against its baseline, folded for the log. */
export function useRunDiff(project, run) {
  const api = useApi();
  return useQuery({
    queryKey: projectKeys.runDiff(project, run?.runId, run?.baselineRunId),
    queryFn: () => api.getRunDiff(project, run.runId, run.baselineRunId),
    enabled: Boolean(project && run?.baselineRunId),
    staleTime: Infinity, // a finished run against a fixed baseline never changes
    select: summariseDiff,
    retry: false,
  }).data;
}

/** Throughput of one finished run, from its progress payload. */
export function useRunThroughput(jobId) {
  const api = useApi();
  return useQuery({
    queryKey: ['runThroughput', jobId],
    queryFn: () => api.getEvaluationProgress(jobId),
    enabled: Boolean(jobId),
    staleTime: Infinity,
    select: summariseThroughput,
    retry: false,
  }).data;
}
