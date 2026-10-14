import { useMemo } from 'react';
import useMapAreas from './useMapAreas.js';
import { selectionOf } from '../model/riskSelection.js';
import { rankedAreas } from '../model/rankedAreas.js';

/**
 * The project's functional areas measured over some dimensions, or one
 * principle of one dimension, worst first. For pages that point at the Map's
 * Risk tab (a dimension or principle page): each area comes with its zone on
 * the absolute density lines (null when too small to judge), its density,
 * its lift (density over the selection's project-wide density: ordering and
 * emphasis only, never the zone), its file count and issues per severity.
 * Without a dimension it is every finding, and lift is null.
 *
 * Open the Map on the same view with
 * `onNavigate(NAV_TAB.MAP, { vizStyle: VIZ_STYLE.RISK, dimensions, principle, area })`.
 * @param {{project: string, source: string, dimensions: string[], principle?: string, active?: boolean}} args
 *   `principle` needs exactly one dimension (as reported: the finding's practice id or principle name)
 * @returns {{areas: object[], loading: boolean, failed: boolean, unavailable: boolean}}
 */
export default function useRiskAreas({ project, source, dimensions, principle = '', active = true }) {
  // The query is keyed by the selection's content, so a new object each render refetches nothing.
  const { areaSet, loading, failed, unavailable } = useMapAreas(project, source, active, selectionOf(dimensions, principle));
  const areas = useMemo(() => rankedAreas(areaSet), [areaSet]);
  return { areas, loading, failed, unavailable };
}
