import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { decodeAreas, NO_AREAS } from '../model/mapAreas.js';
import { mapHistoryQuery, mapHistoryEnabled } from './mapHistoryQuery.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

/**
 * The latest run's functional areas for the Risk tab. Shared projects have
 * no local runs: they are unavailable and never fetch.
 * @param {string} project
 * @param {string} source a PROJECT_SOURCE value
 * @param {boolean} active the Risk tab is on screen
 * @returns {{areaSet: object, loading: boolean, failed: boolean, unavailable: boolean}}
 */
export default function useMapAreas(project, source, active) {
  const api = useApi();
  const query = useQuery({ ...mapHistoryQuery({ api, project, source, active }), select: decodeAreas });
  return {
    areaSet: query.data || NO_AREAS,
    loading: mapHistoryEnabled(project, source, active) && query.isPending,
    failed: query.isError,
    unavailable: source === PROJECT_SOURCE.SHARED,
  };
}
