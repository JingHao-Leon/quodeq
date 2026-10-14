import { useCallback } from 'react';
import { areaPathFilters } from '../model/areaPaths.js';
import { NAV_TAB } from '../../../vocab/navTab.js';
import { openPastDetails } from '../model/pastDetails.js';

/**
 * The Risk panel's actions: View Details opens the Violations workbench
 * filtered to the area, as one area chip holding the area's path filters;
 * on a past day (`onViewPastDetails`) it opens that day's findings for the
 * area's files that day, read-only.
 * @param {{areaState: object, onNavigate?: Function}} args
 * @returns {{onViewDetails: (area: object) => void, onViewPastDetails: (area: object, run: object) => boolean}}
 */
export default function useRiskActions({ areaState, onNavigate }) {
  const files = areaState.areaSet.files;
  const viewDetails = useCallback((area) => {
    onNavigate?.(NAV_TAB.VIOLATIONS, { wb: { area: { name: area.name, paths: areaPathFilters(files, area.name) } } });
  }, [files, onNavigate]);
  const viewPastDetails = useCallback(
    (area, run) => openPastDetails(onNavigate, { area: { name: area.name, paths: area.dots.map((d) => d.path) } }, run),
    [onNavigate],
  );
  return { onViewDetails: viewDetails, onViewPastDetails: viewPastDetails };
}
