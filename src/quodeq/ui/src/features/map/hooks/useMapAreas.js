import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { decodeAreas, NO_AREAS } from '../model/mapAreas.js';
import { mapHistoryQuery, mapHistoryEnabled } from './mapHistoryQuery.js';

/**
 * The latest run's functional areas for the Risk tab, from the project's
 * own source (a shared project's from the shared clone). A `selection`
 * (riskSelection.js) measures the areas over those findings only.
 * @param {string} project
 * @param {string} source a PROJECT_SOURCE value
 * @param {boolean} active the Risk tab is on screen
 * @param {{dimensions: string[], principle?: string}|null} [selection] null: every finding
 * @returns {{areaSet: object, loading: boolean, failed: boolean}}
 */
export default function useMapAreas(project, source, active, selection = null) {
  const api = useApi();
  const query = useQuery({ ...mapHistoryQuery({ api, project, source, active, selection }), select: decodeAreas });
  return {
    areaSet: query.data || NO_AREAS,
    loading: mapHistoryEnabled(project, active) && query.isPending,
    failed: query.isError,
  };
}
