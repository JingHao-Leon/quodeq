import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NO_JOB_ID, evaluationKeys } from '../../../api/queryKeys.js';
import { sameDim } from '../components/liveViolationsOrdering.js';
import { parseDimensionResult } from '../liveDimensionResult.js';

// The cache slot is written only by the run stream (useRunEventStream);
// useQuery subscribes to it so a new frame re-renders the feed.
const STREAM_FED = () => { throw new Error('cache slot is SSE-fed; queryFn must not run'); };

/**
 * Lookup of finished dimensions' results for a running job.
 * @param {string|null} jobId
 * @returns {(dimId: string) => ({score: number, grade: string|null}|null)}
 */
export function useLiveDimensionResults(jobId) {
  const { data = {} } = useQuery({
    queryKey: evaluationKeys.dimensions(jobId || NO_JOB_ID),
    queryFn: STREAM_FED,
    enabled: false,
    staleTime: Infinity,
  });
  return useCallback((dimId) => {
    const key = Object.keys(data).find((k) => sameDim(k, dimId));
    return key ? parseDimensionResult(data[key]) : null;
  }, [data]);
}
