import { useQueries } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext.jsx';
import { projectKeys } from '../api/queryKeys.js';
import { PROJECT_SOURCE } from '../vocab/projectSource.js';

/** The runs to compare: each distinct run on show, never `against` itself; none without `against`. */
export function runsToCompare(runs, against) {
  return against ? [...new Set((runs || []).filter((r) => r && r !== against))] : [];
}

/**
 * The run comparisons a "since the previous period" line needs: each run on
 * show (a dimension's latest run, one call per distinct run) compared,
 * finding by finding, with `against`, the run that closed the previous day,
 * week or month. Nothing is fetched without `against`, nor for a shared
 * project (its runs have no comparison endpoint). A finished run's
 * comparison never changes, so it is never refetched.
 * @param {{project: ?string, source?: string, runs: Array<?string>, against: ?string}} args
 * @returns {{runs: string[], payloads: Array<object|undefined>}} one payload per run, in `runs` order
 */
export function usePeriodDiffs({ project, source = PROJECT_SOURCE.LOCAL, runs, against }) {
  const api = useApi();
  const wanted = runsToCompare(source === PROJECT_SOURCE.SHARED ? [] : runs, against);
  const payloads = useQueries({
    queries: wanted.map((runId) => ({
      queryKey: projectKeys.runDiff(project, runId, against, source),
      queryFn: () => api.getRunDiff(project, runId, against),
      enabled: Boolean(project),
      staleTime: Infinity,
      retry: false,
    })),
    // The payloads alone: an array that keeps its identity while no comparison changes.
    combine: (results) => results.map((r) => r.data),
  });
  return { runs: wanted, payloads };
}
