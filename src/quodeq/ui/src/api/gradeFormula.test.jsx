import { describe, it, expect, vi, beforeEach } from 'vitest';

import { resetGradeFormula, getGradeFormulaInputs } from './gradeFormula.js';

// Longer than the 30 s default the cold read was measured to exceed.
const INPUTS_COLD_READ_MS = 60000;

describe('resetGradeFormula', () => {
  let fetchCalls;

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        ok: true,
        status: 200,
        json: async () => ({ current: {}, defaults: {}, isCustom: false, applied: 0 }),
      };
    }));
  });

  it('sends ?confirm=true on DELETE, matching the destructive-reset contract', async () => {
    await resetGradeFormula();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('/api/grade-formula?confirm=true');
    expect(fetchCalls[0].opts.method).toBe('DELETE');
  });
});

describe('getGradeFormulaInputs', () => {
  it('has no time cap: the cold read can outlast the 30 s client timeout', async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn((url, opts) => new Promise(() => {
      opts.signal.addEventListener('abort', () => { aborted = true; });
    })));
    getGradeFormulaInputs();
    await vi.advanceTimersByTimeAsync(INPUTS_COLD_READ_MS);
    expect(aborted).toBe(false);
    vi.useRealTimers();
  });
});
