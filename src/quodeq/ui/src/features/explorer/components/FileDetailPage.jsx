import { memo, useEffect, useState } from 'react';
import SeverityFilterPills from '../../../components/SeverityFilterPills.jsx';
import FileDetailHeader from './FileDetailHeader.jsx';
import { useFileDetailFiltering } from './useFileDetailFiltering.js';
import { FindingRowsList, useFindingsPaneSpecs } from './fileDetailRows.jsx';
import { useDashboardScrollElement } from './VirtualList.jsx';
import { t } from '../../../strings/index.js';

/** Header, severity filter pills, and the deferred virtualized item list. */
function FileDetailBody({
  file, runId, dateLabel, onDismiss, dimensionsCount, liveSevCounts, liveTotal, totalCompliance,
  showFilters, activeFilter, setActiveFilter, items, virtualKey, scrollElement, handleDismiss, setLowConfExpanded,
}) {
  return (
    <>
      <FileDetailHeader
        file={file}
        sevCounts={liveSevCounts}
        totalViolations={liveTotal}
        totalCompliance={totalCompliance}
        dimensionsCount={dimensionsCount}
        dateLabel={dateLabel}
        runId={runId}
      />

      {showFilters && (
        <SeverityFilterPills
          counts={liveSevCounts}
          complianceCount={totalCompliance}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      )}

      <FindingRowsList
        rows={items} resetKey={virtualKey} scrollElement={scrollElement} setLowConfExpanded={setLowConfExpanded}
        onDismiss={onDismiss ? handleDismiss : undefined} complianceTitle={t('explorer.complianceHeader')}
      />
    </>
  );
}

export default memo(function FileDetailPage({ file, runId, dateLabel, onDismiss, severityFilter }) {
  const dimensionsCount = file?.dimensionsCount || 0;
  const [activeFilter, setActiveFilter] = useState(severityFilter || null);
  const [lowConfExpanded, setLowConfExpanded] = useState(false);

  const {
    dismissedSet, handleDismiss, liveSevCounts, liveTotal, totalCompliance, showFilters, items, violationsBySeverity,
  } = useFileDetailFiltering({ file, onDismiss, activeFilter, lowConfExpanded });

  useFindingsPaneSpecs(file, violationsBySeverity, activeFilter);

  const scrollElement = useDashboardScrollElement();

  // Snap to top whenever the filter changes so a giant list doesn't dump the
  // user mid-scroll into a freshly-mounted virtualizer.
  useEffect(() => {
    if (scrollElement) scrollElement.scrollTop = 0;
  }, [activeFilter, scrollElement]);

  // Remount the virtualizer whenever the items collection changes shape.
  // A fresh useVirtualizer call begins with no cached heights, so the row
  // wrappers re-measure from scratch — eliminating overlap caused by stale
  // measurements lingering from a previous filter or dismiss state.
  const virtualKey = `${activeFilter ?? 'all'}-${dismissedSet.size}-${lowConfExpanded ? 'lc' : ''}-${file?.file || ''}`;

  return (
    <FileDetailBody
      file={file} runId={runId} dateLabel={dateLabel} onDismiss={onDismiss}
      dimensionsCount={dimensionsCount} liveSevCounts={liveSevCounts} liveTotal={liveTotal}
      totalCompliance={totalCompliance} showFilters={showFilters} activeFilter={activeFilter}
      setActiveFilter={setActiveFilter} items={items} virtualKey={virtualKey} scrollElement={scrollElement}
      handleDismiss={handleDismiss} setLowConfExpanded={setLowConfExpanded}
    />
  );
});
