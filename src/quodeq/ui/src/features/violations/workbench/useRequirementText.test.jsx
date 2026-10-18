import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { useRequirementText } from './useRequirementText.js';

const standard = { principles: [{ name: 'Integrity', requirements: [{ id: 'S-INT-1', text: 'Input MUST be validated' }] }] };

function wrap(api) {
  const client = new QueryClient();
  return ({ children }) => <QueryClientProvider client={client}><ApiProvider value={api}>{children}</ApiProvider></QueryClientProvider>;
}

describe('useRequirementText', () => {
  it('reads what the requirement asks from its dimension standard', async () => {
    const api = { getStandard: vi.fn().mockResolvedValue(standard) };
    const { result } = renderHook(() => useRequirementText('security', 'S-INT-1'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current).toBe('Input MUST be validated'));
    expect(api.getStandard).toHaveBeenCalledWith('security');
  });

  it('is empty for an id the standard does not list, and asks nothing without a requirement', async () => {
    const api = { getStandard: vi.fn().mockResolvedValue(standard) };
    const unknown = renderHook(() => useRequirementText('security', 'S-XX-9'), { wrapper: wrap(api) });
    await waitFor(() => expect(api.getStandard).toHaveBeenCalled());
    expect(unknown.result.current).toBe('');
    const none = { getStandard: vi.fn() };
    const blank = renderHook(() => useRequirementText('security', ''), { wrapper: wrap(none) });
    expect(blank.result.current).toBe('');
    expect(none.getStandard).not.toHaveBeenCalled();
  });
});
