import { useQuery } from '@tanstack/react-query';
import { getGradeFormulaInputs } from '../../../api/index.js';
import { gradeFormulaKeys } from '../../../api/queryKeys.js';

/**
 * Every local project's scoring inputs, read once per editor visit (and again
 * after an apply or reset, which invalidates the key). Scoring every project
 * can take seconds on a cold score cache; the knobs work meanwhile.
 * @returns {{inputs: {projects: Array}|null, loading: boolean, failed: boolean}}
 */
export function useFormulaInputs() {
  const query = useQuery({
    queryKey: gradeFormulaKeys.inputs(),
    queryFn: getGradeFormulaInputs,
    staleTime: Infinity,
    retry: false,
  });
  return { inputs: query.data || null, loading: query.isPending, failed: query.isError };
}
