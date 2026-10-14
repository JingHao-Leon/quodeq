import { useCallback } from 'react';
import { areaPathFilters } from '../model/areaPaths.js';
import { SCOPE_KIND, openScope } from '../../violations/scope/scopeModel.js';
import { openPastScope } from '../model/detailScopes.js';

/**
 * The Risk panel's actions: View Details opens the area's findings as one
 * page (a scoped Findings view of the area's path filters); on a past day
 * (`onViewPastDetails`) it opens that day's findings for the area's files
 * that day, read-only.
 * @param {{areaState: object, onNavigate?: Function}} args
 * @returns {{onViewDetails: (area: object) => void, onViewPastDetails: (area: object, run: object) => boolean}}
 */
export default function useRiskActions({ areaState, onNavigate }) {
  const files = areaState.areaSet.files;
  const viewDetails = useCallback((area) => {
    openScope(onNavigate, { kind: SCOPE_KIND.AREA, name: area.name, paths: areaPathFilters(files, area.name) });
  }, [files, onNavigate]);
  const viewPastDetails = useCallback(
    (area, run) => openPastScope(onNavigate, { kind: SCOPE_KIND.AREA, name: area.name, paths: area.dots.map((d) => d.path) }, run),
    [onNavigate],
  );
  return { onViewDetails: viewDetails, onViewPastDetails: viewPastDetails };
}
