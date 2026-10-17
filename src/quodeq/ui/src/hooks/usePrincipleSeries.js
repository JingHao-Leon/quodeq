/**
 * One dimension's per-principle score series, fetched on demand by the
 * dimension and principle pages (the Overview's trend carries no principles).
 * Its query key sits in the project subtree, so a dismiss, a restore or a
 * formula change invalidates it with the rest of the project's reads.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext.jsx';
import { projectKeys } from '../api/queryKeys.js';
import { PROJECT_SOURCE } from '../vocab/projectSource.js';
import { STALE_TIME_MS } from './queryDefaults.js';

const NO_ROWS = Object.freeze([]);

/**
 * @param {?string} project
 * @param {string} source PROJECT_SOURCE.LOCAL or PROJECT_SOURCE.SHARED
 * @param {?string} dimension
 * @returns {{rows: import('../models/principleSeries.js').PrincipleSeriesRow[], loading: boolean, error: ?Error}}
 *   `rows` newest first, empty until loaded (feed them to principlePeriodSeries / principlePeriodDelta).
 */
export function usePrincipleSeries(project, source = PROJECT_SOURCE.LOCAL, dimension) {
  const { getPrincipleSeries, sharedGetPrincipleSeries } = useApi();
  const fetchSeries = source === PROJECT_SOURCE.SHARED ? sharedGetPrincipleSeries : getPrincipleSeries;
  const q = useQuery({
    queryKey: projectKeys.principleSeries(project, dimension, source),
    queryFn: () => fetchSeries(project, dimension),
    enabled: Boolean(project && dimension),
    staleTime: STALE_TIME_MS,
  });
  return { rows: q.data?.rows || NO_ROWS, loading: q.isLoading, error: q.error || null };
}
