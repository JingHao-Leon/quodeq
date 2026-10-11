import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLiveDimensionResults } from './useLiveDimensionResults.js';
import { evaluationKeys } from '../../../api/queryKeys.js';

function wrapperWith(seed) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(evaluationKeys.dimensions('job-1'), seed);
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useLiveDimensionResults', () => {
  it('finds a finished dimension case-insensitively', () => {
    const { result } = renderHook(() => useLiveDimensionResults('job-1'), {
      wrapper: wrapperWith({ Security: { dimension: 'Security', overallScore: '8.4/10', overallGrade: 'Good' } }),
    });
    expect(result.current('security')).toEqual({ score: 8.4, grade: 'Good' });
  });

  it('returns null for a dimension with no frame yet', () => {
    const { result } = renderHook(() => useLiveDimensionResults('job-1'), { wrapper: wrapperWith({}) });
    expect(result.current('reliability')).toBeNull();
  });
});
