import { useCallback } from 'react';
import { areaPathFilters } from '../model/areaPaths.js';
import { NAV_TAB } from '../../../vocab/navTab.js';

/**
 * The Risk panel's action: View Details opens the Violations workbench
 * filtered to the area, as one area chip holding the area's path filters.
 * @param {{areaState: object, onNavigate?: Function}} args
 * @returns {{onViewDetails: (area: object) => void}}
 */
export default function useRiskActions({ areaState, onNavigate }) {
  const files = areaState.areaSet.files;
  const viewDetails = useCallback((area) => {
    onNavigate?.(NAV_TAB.VIOLATIONS, { wb: { area: { name: area.name, paths: areaPathFilters(files, area.name) } } });
  }, [files, onNavigate]);
  return { onViewDetails: viewDetails };
}
