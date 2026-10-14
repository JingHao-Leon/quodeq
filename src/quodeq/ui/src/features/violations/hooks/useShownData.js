import { useAsOfScores } from '../../../hooks/useAsOfScores.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

/** Today's findings, or a past day's (`asOf`) read as of that day's last run. */
export function useShownData(data) {
  const { selectedProject, selectedSource = PROJECT_SOURCE.LOCAL, asOf = null } = data;
  const past = useAsOfScores(selectedProject, selectedSource, asOf);
  if (!asOf) return data;
  return {
    ...data,
    accumulatedDimensions: past.data?.accumulated?.dimensions || [],
    loading: past.isLoading,
    isFetching: past.isFetching,
    error: past.error || null,
  };
}
