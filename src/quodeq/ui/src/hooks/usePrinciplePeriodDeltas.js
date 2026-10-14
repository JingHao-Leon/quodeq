/**
 * A dimension's principles' change since the previous period of the score
 * history's grouping (day, week or month), the way the dimension's own
 * arrow reads it. Read by the dimension page (each principle card, and the
 * header's tiles against the previous period) and by a principle's scoped
 * Findings view (its header's arrow).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext.jsx';
import { projectKeys } from '../api/queryKeys.js';
import { extractDimensionPeriodSeries, sliceTrendAtRun } from '../utils/dailyGrouping.js';
import { PROJECT_SOURCE } from '../vocab/projectSource.js';
import { STALE_TIME_MS } from './queryDefaults.js';

// The series asked for: the period before, and the one on show.
const PREVIOUS_AND_NOW = 2;
const nameKey = (name) => String(name ?? '').toLowerCase();

/**
 * The run that closes the period before the one on show, from the history
 * cut at `activeRunId`; null when there is no previous period.
 * @param {{trend: object[], dimension: string, granularity: string, activeRunId: ?string}} args
 * @returns {?string}
 */
export function previousPeriodRunId({ trend, dimension, granularity, activeRunId }) {
  const series = extractDimensionPeriodSeries(sliceTrendAtRun(trend || [], activeRunId), dimension, granularity, PREVIOUS_AND_NOW);
  return series.length === PREVIOUS_AND_NOW ? series[0].runId : null;
}

/**
 * Each principle's score now minus its score in `previousDim` (a run's
 * dimension), matched by name whatever its case. The run's principles
 * arrive as `principles` (slim scores, `{principle}` or `{name}`) or as
 * `principleGrades` (eval-shaped); a principle missing from either side,
 * or with no number, has no change.
 * @param {?object} previousDim
 * @param {{principle: string, score: *}[]} principles the ones on show
 * @returns {Map<string, number>} principle name -> change
 */
export function principleChanges(previousDim, principles) {
  const rows = previousDim?.principles || previousDim?.principleGrades || [];
  const was = new Map(rows.map((row) => [nameKey(row.principle ?? row.name), parseFloat(row.score)]));
  const out = new Map();
  for (const p of principles || []) {
    const before = was.get(nameKey(p.principle));
    const now = parseFloat(p.score);
    if (Number.isFinite(before) && Number.isFinite(now)) out.set(p.principle, now - before);
  }
  return out;
}

/**
 * The previous period's run is fetched once (the same run-scores query the
 * dimension page reads, so it is usually cached) and its principles compared
 * with the ones on show.
 * @param {{project: ?string, selectedSource?: string, trend: object[], dimension: string,
 *   granularity: string, activeRunId: ?string, principles: {principle: string, score: *}[]}} args
 * @returns {{principles: Map<string, number>, previous: ?object}} each principle's change,
 *   and the previous period's dimension (its totals and files read) for the header's tiles
 */
export function usePrinciplePeriodDeltas({ project, selectedSource = PROJECT_SOURCE.LOCAL, trend, dimension, granularity, activeRunId, principles }) {
  const { getRunScores, sharedGetRunScores } = useApi();
  const fetchRunScores = selectedSource === PROJECT_SOURCE.SHARED ? sharedGetRunScores : getRunScores;
  const beforeRunId = useMemo(
    () => previousPeriodRunId({ trend, dimension, granularity, activeRunId }),
    [trend, dimension, granularity, activeRunId],
  );
  const before = useQuery({
    queryKey: projectKeys.runScores(project, beforeRunId, selectedSource),
    queryFn: () => fetchRunScores(project, beforeRunId),
    enabled: Boolean(project && beforeRunId),
    staleTime: STALE_TIME_MS,
  });
  return useMemo(() => {
    const previous = (before.data?.dimensions || []).find((d) => nameKey(d.dimension) === nameKey(dimension)) || null;
    return { principles: principleChanges(previous, principles), previous };
  }, [before.data, dimension, principles]);
}
