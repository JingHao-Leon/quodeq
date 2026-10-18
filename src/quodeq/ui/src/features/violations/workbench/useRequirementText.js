/**
 * What a requirement asks, from its dimension's standard (the By type view
 * reads it the same way): '' until the standard loads, or for an id it
 * does not list.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { standardsKeys } from '../../../api/queryKeys.js';
import { requirementIndex } from '../byTypeModel.js';

export function useRequirementText(dimension, req) {
  const api = useApi();
  const { data } = useQuery({
    queryKey: standardsKeys.detail(dimension),
    queryFn: () => api.getStandard(dimension),
    enabled: Boolean(dimension && req),
    staleTime: Infinity,
    retry: false,
  });
  return useMemo(() => requirementIndex(data).get(req)?.text || '', [data, req]);
}
