import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { summariseThroughput } from './runLogModel.js';

/** Throughput of one finished run, from its progress payload. */
export function useRunThroughput(jobId) {
  const api = useApi();
  return useQuery({
    queryKey: ['runThroughput', jobId],
    // Files and time only: counting findings would unpack an archived run.
    queryFn: () => api.getEvaluationProgress(jobId, { findings: false }),
    enabled: Boolean(jobId),
    staleTime: Infinity,
    select: summariseThroughput,
    retry: false,
  }).data;
}
