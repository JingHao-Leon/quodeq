import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFindingDetail } from './useFindingDetail.js';
import { FINDING_STATUS } from '../violationsVocab.js';

let hydratedRows = [];
vi.mock('../../explorer/hooks/useHydratedCompliance.js', () => ({ useHydratedFindings: () => hydratedRows }));

const v = (title, extra = {}) => ({ file: 'a.py', line: 3, req: 'R-1', title, ...extra });
const first = v('One');
const second = v('Two');
const dims = [{ dimension: 'security', violations: [first, second] }];
const asFinding = (raw, status = FINDING_STATUS.OPEN) => ({ status, dimension: 'security', raw });
const run = (finding) => renderHook(() => useFindingDetail(finding, dims)).result.current;

describe('useFindingDetail', () => {
  it('returns the right hydrated row for each duplicate location', () => {
    hydratedRows = [v('One', { reason: 'r1' }), v('Two', { reason: 'r2' })];
    expect(run(asFinding(first)).reason).toBe('r1');
    expect(run(asFinding(second)).reason).toBe('r2');
  });

  it('falls back to file, line and rule when the detail re-titles the finding', () => {
    hydratedRows = [v('Renamed', { reason: 'rn' })];
    expect(run(asFinding(first)).reason).toBe('rn');
  });

  it('returns raw while the hydrated list lacks the finding', () => {
    hydratedRows = [];
    expect(run(asFinding(first))).toBe(first);
  });

  it('returns raw for a dismissed finding and null for none', () => {
    hydratedRows = [v('One', { reason: 'r1' })];
    expect(run(asFinding(first, FINDING_STATUS.DISMISSED))).toBe(first);
    expect(run(null)).toBeNull();
  });
});
