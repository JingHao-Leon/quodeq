/**
 * What the Overview compares with the previous period of the chart's
 * grouping (day, week or month): the previous period's numbers for the
 * header tiles, and the since line (each shown dimension's latest run
 * compared, finding by finding, with the run that closed the previous
 * period). Plus the model the run on show was evaluated with.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { useAsOfScores } from '../../../hooks/useAsOfScores.js';
import { usePeriodDiffs } from '../../../hooks/usePeriodDiffs.js';
import { sinceSummary, runClosingPreviousPeriod } from '../../../models/sinceSummary.js';
import { previousPeriodMetrics, modelOfRun } from '../overviewHeadModel.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { STALE_TIME_MS } from '../../../hooks/queryDefaults.js';
import { nameKey } from '../../../utils/nameKey.js';


/**
 * The previous period's numbers as the header tiles read them (scopeMetrics),
 * from that period's as-of scores (the query the Overview runs for an older
 * run); null with no previous period.
 * @param {{project: ?string, source?: string, periodTrend: object[], runOnShow: ?string, visibleNames: Set<string>}} args
 */
export function usePreviousPeriodMetrics({ project, source = PROJECT_SOURCE.LOCAL, periodTrend, runOnShow, visibleNames }) {
  const before = runClosingPreviousPeriod(periodTrend, runOnShow);
  const prev = useAsOfScores(project, source, before ? { runId: before } : null);
  return useMemo(() => (before ? previousPeriodMetrics(prev.data, visibleNames) : null), [before, prev.data, visibleNames]);
}

/**
 * The Overview's since line: each shown dimension counted from its own
 * latest run's comparison with the run that closed the previous period.
 * @param {{project: ?string, source?: string, dimensions: object[], periodTrend: object[], runOnShow: ?string}} args
 * @returns {?object} sinceSummary output
 */
export function useOverviewSince({ project, source = PROJECT_SOURCE.LOCAL, dimensions, periodTrend, runOnShow }) {
  const against = runClosingPreviousPeriod(periodTrend, runOnShow);
  const dims = dimensions || [];
  const { runs, payloads } = usePeriodDiffs({ project, source, runs: dims.map((d) => d.fromRunId), against });
  // A few comparisons of a handful of dimensions: summed on each render, no memo to keep in step.
  const ownRun = new Map(dims.map((d) => [nameKey(d.dimension), d.fromRunId]));
  return sinceSummary(payloads, (dimension, i) => ownRun.get(nameKey(dimension)) === runs[i]);
}

/**
 * The model the run on show was evaluated with (the run log's, the newest
 * finished run's when it does not list that run); null for a shared
 * project, which has no run log.
 * @param {{project: ?string, source?: string, runId: ?string}} args
 */
export function useRunModel({ project, source = PROJECT_SOURCE.LOCAL, runId }) {
  const api = useApi();
  const local = source !== PROJECT_SOURCE.SHARED;
  const log = useQuery({
    queryKey: projectKeys.runLog(project),
    queryFn: () => api.getRunLog(project),
    enabled: Boolean(project && local),
    staleTime: STALE_TIME_MS,
  });
  return local ? modelOfRun(log.data?.runs, runId) : null;
}
