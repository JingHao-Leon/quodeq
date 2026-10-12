import { useMemo, useState } from 'react';
import { readVisibleStandardIds } from '../../../utils/visibleStandards.js';
import { computeSummaryFromDimensions } from '../../../utils/visibleStandardsSummary.js';
import { useDismissedFindings } from '../components/useDismissedFindings.js';

/**
 * The Violations page's state: the dismissed findings with their mutation
 * handlers, the visible dimensions and their rolled-up counts.
 *
 * No data refresh happens here. Mounting the page is not evidence that the
 * dashboard changed: a finished run invalidates the caches itself and
 * staleTime ages the rest out. Marking the dashboard stale on mount made
 * the Overview refetch it on every return from this tab.
 */
export function useViolationsPageState({ selectedProject, onReconcile, accumulatedDimensions, selectedSource }) {
  const [restoreError, setRestoreError] = useState(null);
  // The dismissed list is a project query: a dismiss made elsewhere prepends
  // its entry to it and the reconcile refetches it (see useDismissedFindings).
  const { dismissed, loading: dismissedLoading, handleRestore, handleRestoreAll, handleDelete, handleDeleteAll } =
    useDismissedFindings({ selectedProject, setRestoreError, selectedSource, onReconcile });

  const visibleDimensions = useMemo(() => {
    const visibleSet = new Set(readVisibleStandardIds());
    return accumulatedDimensions.filter((d) => visibleSet.has((d.dimension || '').toLowerCase()));
  }, [accumulatedDimensions]);

  const summary = useMemo(() => computeSummaryFromDimensions(visibleDimensions), [visibleDimensions]);

  return {
    dismissed,
    dismissedLoading,
    handleRestore, handleRestoreAll, handleDelete, handleDeleteAll,
    restoreError, visibleDimensions,
    summary,
  };
}
