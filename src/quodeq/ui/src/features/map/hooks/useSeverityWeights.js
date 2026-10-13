import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { gradeFormulaKeys } from '../../../api/queryKeys.js';
import { STALE_TIME_MS } from '../../../hooks/queryDefaults.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../viz/core/mapBadness.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

function validWeights(w) {
  return Boolean(w) && SEVERITY_ORDER.every((k) => Number.isFinite(w[k]) && w[k] >= 0);
}

/**
 * The grade formula's severity weights; the defaults while loading, on error,
 * and for shared projects.
 * @returns {{critical: number, major: number, minor: number}}
 */
export default function useSeverityWeights(project, source) {
  const api = useApi();
  const query = useQuery({
    queryKey: gradeFormulaKeys.current(),
    queryFn: () => api.getGradeFormula(),
    enabled: Boolean(project) && source !== PROJECT_SOURCE.SHARED,
    staleTime: STALE_TIME_MS,
    retry: false,
    select: (data) => data?.current?.severityWeight,
  });
  return validWeights(query.data) ? query.data : DEFAULT_SEVERITY_WEIGHTS;
}
