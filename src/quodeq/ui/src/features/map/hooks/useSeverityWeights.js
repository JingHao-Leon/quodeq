import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { gradeFormulaKeys } from '../../../api/queryKeys.js';
import { STALE_TIME_MS } from '../../../hooks/queryDefaults.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../viz/core/mapBadness.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';

function validWeights(w) {
  return Boolean(w) && SEVERITY_ORDER.every((k) => Number.isFinite(w[k]) && w[k] >= 0);
}

/**
 * The grade formula's severity weights (this app's, which grades shared
 * projects too); the defaults while loading and on error.
 * @param {string} project the selected project; none asks nothing
 * @returns {{critical: number, major: number, minor: number}}
 */
export default function useSeverityWeights(project) {
  const api = useApi();
  const query = useQuery({
    queryKey: gradeFormulaKeys.current(),
    queryFn: () => api.getGradeFormula(),
    enabled: Boolean(project),
    staleTime: STALE_TIME_MS,
    retry: false,
    select: (data) => data?.current?.severityWeight,
  });
  return validWeights(query.data) ? query.data : DEFAULT_SEVERITY_WEIGHTS;
}
