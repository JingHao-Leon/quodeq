import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { gradeFormulaKeys } from '../../../api/queryKeys.js';

vi.mock('../../../api/index.js', () => ({ getGradeFormulaInputs: vi.fn() }));

import { getGradeFormulaInputs } from '../../../api/index.js';
import { useFormulaInputs } from './useFormulaInputs.js';

const INPUTS = { projects: [{ id: 'a', dimensions: [] }] };
const FRESH = { projects: [{ id: 'b', dimensions: [] }] };
let client;

function mount() {
  const wrapper = ({ children }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useFormulaInputs(), { wrapper });
}

beforeEach(() => {
  getGradeFormulaInputs.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useFormulaInputs', () => {
  it('is loading until the inputs arrive, then hands them over', async () => {
    getGradeFormulaInputs.mockResolvedValue(INPUTS);
    const { result } = mount();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.inputs).toEqual(INPUTS));
    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('fails when the read errors and there is nothing to show', async () => {
    getGradeFormulaInputs.mockRejectedValue(new Error('down'));
    const { result } = mount();
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.inputs).toBeNull();
  });

  it('reads again on each visit while showing the last inputs', async () => {
    client.setQueryData(gradeFormulaKeys.inputs(), INPUTS);
    let resolve;
    getGradeFormulaInputs.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = mount();
    expect(result.current.inputs).toEqual(INPUTS);
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(getGradeFormulaInputs).toHaveBeenCalledTimes(1));
    await act(async () => { resolve(FRESH); });
    await waitFor(() => expect(result.current.inputs).toEqual(FRESH));
  });

  it('keeps the last inputs and does not fail when a refresh errors', async () => {
    client.setQueryData(gradeFormulaKeys.inputs(), INPUTS);
    getGradeFormulaInputs.mockRejectedValue(new Error('down'));
    const { result } = mount();
    await waitFor(() => expect(getGradeFormulaInputs).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.getQueryState(gradeFormulaKeys.inputs()).status).toBe('error'));
    expect(result.current.failed).toBe(false);
    expect(result.current.inputs).toEqual(INPUTS);
  });

  it('retries on request', async () => {
    getGradeFormulaInputs.mockRejectedValueOnce(new Error('down')).mockResolvedValue(INPUTS);
    const { result } = mount();
    await waitFor(() => expect(result.current.failed).toBe(true));
    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(result.current.inputs).toEqual(INPUTS));
    expect(result.current.failed).toBe(false);
  });
});
