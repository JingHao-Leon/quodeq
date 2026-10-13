import { useCallback } from 'react';
import { areaPathFilters, largestFolder } from '../model/areaPaths.js';
import { nearestTreePath } from '../viz/core/treePath.js';
import { NAV_TAB } from '../../../vocab/navTab.js';

/**
 * The Risk panel's two actions: View Details opens the Violations workbench
 * filtered to the area's path chips, Show in Circle Pack opens the pack at
 * the tree folder nearest the area's largest folder.
 * @param {{areaState: object, fullTree: object, onNavigate?: Function, onShowInPack?: Function}} args
 * @returns {{onViewDetails: (area: object) => void, onShowInPack: (area: object) => void}}
 */
export default function useRiskActions({ areaState, fullTree, onNavigate, onShowInPack }) {
  const files = areaState.areaSet.files;
  const viewDetails = useCallback((area) => {
    onNavigate?.(NAV_TAB.VIOLATIONS, { wb: { paths: areaPathFilters(files, area.name) } });
  }, [files, onNavigate]);
  const showInPack = useCallback((area) => {
    onShowInPack?.(nearestTreePath(fullTree, largestFolder(area.dots.map((d) => d.path))));
  }, [fullTree, onShowInPack]);
  return { onViewDetails: viewDetails, onShowInPack: showInPack };
}
