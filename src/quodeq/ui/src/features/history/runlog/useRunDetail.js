import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { summariseThroughput } from './runLogModel.js';

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
