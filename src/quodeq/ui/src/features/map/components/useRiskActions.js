import { useCallback } from 'react';
import { openScope } from '../../violations/scope/scopeModel.js';
import { areaScope, areaFindingsScope, openPastScope } from '../model/detailScopes.js';

/**
 * The Risk panel's actions: View Details opens the area's findings as one
 * page (a scoped Findings view of the area's path filters); on a past day
 * (`onViewPastDetails`) it opens that day's findings for the area's files
 * that day, read-only. Both carry whether the Map judged the area too
 * small (its verdict is smoothed over runs, which one run's findings cannot redo),
 * and, on a filtered sky (`selection`), its dimensions and principle.
 * @param {{areaState: object, selection?: ?{dimensions: string[], principle?: string}, onNavigate?: Function}} args
 * @returns {{onViewDetails: (area: object) => void, onViewPastDetails: (area: object, run: object) => boolean}}
 */
export default function useRiskActions({ areaState, selection = null, onNavigate }) {
  const files = areaState.areaSet.files;
  const viewDetails = useCallback((area) => {
    openScope(onNavigate, areaFindingsScope(area, files, selection));
  }, [files, selection, onNavigate]);
  const viewPastDetails = useCallback(
    (area, run) => openPastScope(onNavigate, areaScope(area, area.dots.map((d) => d.path), selection), run),
    [selection, onNavigate],
  );
  return { onViewDetails: viewDetails, onViewPastDetails: viewPastDetails };
}
