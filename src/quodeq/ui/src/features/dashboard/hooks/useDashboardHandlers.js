import { useMemo } from 'react';
import { NAV_TAB } from '../../../vocab/navTab.js';

/**
 * The dashboard's navigation callbacks (the run page's dimension card, the
 * Overview's accumulated dimension), memoized so the cards do not re-render
 * on every parent render. The run page is History's ("open run"), so the
 * dimension it opens keeps History lit in the sidebar.
 *
 * Each is a no-op without an `onNavigate`, so the page renders fine read-only.
 */
export function useDashboardHandlers(onNavigate, dashboard) {
  return useMemo(() => ({
    handleDimensionCardClick: (item, runId) => {
      if (!onNavigate) return;
      const dateLabel = dashboard?.selectedRun?.dateLabel || item.fromDateLabel;
      onNavigate(NAV_TAB.EXPLORER, {
        dimension: item.dimension, runId: runId || item.fromRunId, dateLabel, fromProject: item.fromProject, sourceTab: NAV_TAB.HISTORY,
      });
    },
    handleAccumulatedDimensionClick: (item) => {
      if (onNavigate) onNavigate(NAV_TAB.EXPLORER, { dimension: item.dimension, runId: item.fromRunId, dateLabel: item.fromDateLabel, fromProject: item.fromProject });
    },
  }), [onNavigate, dashboard]);
}
