import { useCallback, useMemo } from 'react';
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
  // Parsed once per payload, so a dimension's result keeps its identity
  // until its own frame changes (memoised rows depend on it).
  const parsed = useMemo(() => Object.fromEntries(
    Object.entries(data).map(([k, frame]) => [k, parseDimensionResult(frame)]),
  ), [data]);
  return useCallback((dimId) => {
    const key = Object.keys(parsed).find((k) => sameDim(k, dimId));
    return key ? parsed[key] : null;
  }, [parsed]);
}
