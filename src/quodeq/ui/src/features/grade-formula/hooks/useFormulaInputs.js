import { useQuery } from '@tanstack/react-query';
import { getGradeFormulaInputs } from '../../../api/index.js';
import { gradeFormulaKeys } from '../../../api/queryKeys.js';

/**
 * Every local project's scoring inputs, read again on each editor visit. The
 * last inputs stay on screen while the new read runs (scoring every project
 * can take tens of seconds on a cold score cache; the knobs work meanwhile).
 * The inputs do not depend on the formula, so an apply leaves them alone.
 * `failed` only when there is nothing to show; `retry` reads again.
 * @returns {{inputs: {projects: Array}|null, loading: boolean, failed: boolean, retry: () => void}}
 */
export function useFormulaInputs() {
  const query = useQuery({
    queryKey: gradeFormulaKeys.inputs(),
    queryFn: getGradeFormulaInputs,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const inputs = query.data || null;
  // A retry after a failure reads as loading again, not as the old failure.
  const reading = !inputs && query.isFetching;
  return {
    inputs, loading: query.isPending || reading, failed: query.isError && !inputs && !reading, retry: query.refetch,
  };
}
