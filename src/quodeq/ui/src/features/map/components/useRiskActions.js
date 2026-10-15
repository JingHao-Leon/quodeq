import { useCallback } from 'react';
import { areaPathFilters } from '../model/areaPaths.js';
import { SCOPE_KIND, openScope } from '../../violations/scope/scopeModel.js';
import { openPastScope } from '../model/detailScopes.js';
import { AREA_KIND } from '../mapVocab.js';

/**
 * An area as a scoped view: its name, its paths, whether the Map judged it
 * too small, and, on a filtered sky, the selection it was measured over (its
 * dimensions, and its principle), so its findings are that selection's.
 */
function areaScope(area, paths, selection) {
  const scope = { kind: SCOPE_KIND.AREA, name: area.name, paths, small: area.kind === AREA_KIND.SMALL };
  if (!selection) return scope;
  return { ...scope, dimensions: selection.dimensions, ...(selection.principle ? { principle: selection.principle } : {}) };
}

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
    openScope(onNavigate, areaScope(area, areaPathFilters(files, area.name), selection));
  }, [files, selection, onNavigate]);
  const viewPastDetails = useCallback(
    (area, run) => openPastScope(onNavigate, areaScope(area, area.dots.map((d) => d.path), selection), run),
    [selection, onNavigate],
  );
  return { onViewDetails: viewDetails, onViewPastDetails: viewPastDetails };
}
