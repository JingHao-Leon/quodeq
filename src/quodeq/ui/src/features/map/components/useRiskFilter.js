import { useCallback, useMemo, useState } from 'react';
import { navPrinciple, riskSelection } from '../model/riskSelection.js';
import useMapAreas from '../hooks/useMapAreas.js';
import { useSettledValue } from '../../../hooks/useSettledValue.js';

// Ticking several dimensions in a row asks the server once, for the last selection.
const SELECTION_SETTLE_MS = 450;

/**
 * The Risk tab's finding selection: the Dimensions filter, narrowed to the
 * principle the Map was opened on (nav `principle` with one `dimensions`
 * entry) while the filter keeps exactly that dimension. Changing the filter
 * or clearing the principle drops the principle and tells the nav entry
 * (`onFilterEdited`), so a return to this entry keeps the user's filter
 * rather than the link's.
 * @param {{nav?: object, dimensionState: {allDimensions: string[], selectedDimensions: Set<string>, onToggleDimension: Function}}} args
 * @returns {{selection: object|null, principle: {dimension: string, name: string}|null, clearPrinciple: Function, onToggleDimension: Function}}
 */
export function useRiskFilter({ nav, dimensionState }) {
  const [principle, setPrinciple] = useState(() => navPrinciple(nav));
  const { allDimensions, selectedDimensions, onToggleDimension } = dimensionState;
  const onFilterEdited = nav?.onFilterEdited;
  const clearPrinciple = useCallback(() => { setPrinciple(null); onFilterEdited?.(); }, [onFilterEdited]);
  const onToggle = useCallback((dim) => { clearPrinciple(); onToggleDimension(dim); }, [clearPrinciple, onToggleDimension]);
  const selection = useMemo(
    () => riskSelection({ allDimensions, selectedDimensions, principle }),
    [allDimensions, selectedDimensions, principle],
  );
  return { selection, principle: selection?.principle ? principle : null, clearPrinciple, onToggleDimension: onToggle };
}

/**
 * The Risk tab's filter (useRiskFilter) and the areas it measures, fetched
 * while the tab is on screen (`active`), with the selection they were
 * measured over (the filter's, once a burst of changes settles).
 * @param {{nav?: object, dimensionState: object, project: string, source: string, active: boolean}} args
 * @returns {{riskFilter: object, areaState: object, selection: object|null}}
 */
export default function useRiskState({ nav, dimensionState, project, source, active }) {
  const riskFilter = useRiskFilter({ nav, dimensionState });
  const selection = useSettledValue(riskFilter.selection, SELECTION_SETTLE_MS);
  const areaState = useMapAreas(project, source, active, selection);
  return { riskFilter, areaState, selection };
}
