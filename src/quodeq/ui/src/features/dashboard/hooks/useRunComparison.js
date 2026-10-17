/**
 * The run on the run page against the run it was compared with: its run
 * log entry (origin, model, commit, duration, files, baseline), the run
 * diff folded for the since line and the cards' footers, the previous
 * run's dimensions (for the tiles' and cards' changes) and each
 * dimension's score change. Nothing is compared on a shared project (it
 * has no run log) or on a run with no baseline.
 */
import { useMemo } from 'react';
import { useRunDiff } from '../../../hooks/useRunDiff.js';
import { useRunLogRuns } from './useOverviewPeriod.js';
import { useRunDashboard } from './useDashboard.js';
import { runChangeView, runDimensionTrends } from '../runPageModel.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

/**
 * @param {{project: ?string, source: string, runId: ?string, dimensions: ?object[]}} args
 * @returns {{run: ?object, settled: boolean, compared: boolean, change: ?{perDim: object, since: ?object},
 *   previousDims: ?object[], dimTrends: object}} `settled` once it is known whether the run was compared
 *   (the run log has loaded, or the project is shared)
 */
export function useRunComparison({ project, source, runId, dimensions }) {
  const runs = useRunLogRuns(project, source);
  const run = useMemo(() => (runs || []).find((r) => r.runId === runId) || null, [runs, runId]);
  const change = useRunDiff(project, run, runChangeView);
  const previous = useRunDashboard({ project, runId: run?.baselineRunId ?? null, source });
  const previousDims = previous?.dimensions ?? null;
  const settled = source === PROJECT_SOURCE.SHARED || runs !== null;
  return useMemo(() => ({
    run,
    settled,
    compared: Boolean(run?.baselineRunId),
    change: change ?? null,
    previousDims,
    dimTrends: runDimensionTrends(dimensions, previousDims),
  }), [run, settled, change, previousDims, dimensions]);
}
