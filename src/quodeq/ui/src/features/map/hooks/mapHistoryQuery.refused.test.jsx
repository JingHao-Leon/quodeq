import { describe, it, expect } from 'vitest';
import { refetchUnlessRefused } from './mapHistoryQuery.js';
import { ERROR_RETRY_MS } from '../../../hooks/queryDefaults.js';

const withError = (error) => ({ state: { error } });

describe('refetchUnlessRefused', () => {
  it('stops asking once the server refused the selection (400)', () => {
    expect(refetchUnlessRefused(withError({ status: 400 }))).toBe(false);
  });

  it('keeps re-asking after any other error, and not at all without one', () => {
    expect(refetchUnlessRefused(withError({ status: 500 }))).toBe(ERROR_RETRY_MS);
    expect(refetchUnlessRefused(withError(null))).toBe(false);
  });
});
