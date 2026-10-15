import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import useRiskActions from './useRiskActions.js';
import { AREA_KIND } from '../mapVocab.js';

const areaState = { areaSet: { files: [{ path: 'src/api/a.py', area: 'api' }] } };
const area = (kind) => ({ name: 'api', kind, dots: [{ path: 'src/api/a.py' }] });

describe('useRiskActions', () => {
  it('View details carries whether the Map judged the area too small', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useRiskActions({ areaState, onNavigate }));
    result.current.onViewDetails(area(AREA_KIND.SMALL));
    result.current.onViewDetails(area(AREA_KIND.HOTSPOT));
    expect(onNavigate.mock.calls.map(([, p]) => p.scope.small)).toEqual([true, false]);
    expect(onNavigate.mock.calls[0][1].scope).toMatchObject({ kind: 'area', name: 'api' });
  });

  it('a past day opens that day\'s files of the area, read-only, with the same flag', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useRiskActions({ areaState, onNavigate }));
    expect(result.current.onViewPastDetails(area(AREA_KIND.SMALL), { runId: 'r1', day: '2026-10-01' })).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith('violations', {
      scope: { kind: 'area', name: 'api', paths: ['src/api/a.py'], small: true }, asOf: { runId: 'r1', day: '2026-10-01' },
    });
  });

  it('on a filtered sky both carry the selection the areas were measured over', () => {
    const onNavigate = vi.fn();
    const selection = { dimensions: ['security'], principle: 'Authenticity' };
    const { result } = renderHook(() => useRiskActions({ areaState, selection, onNavigate }));
    result.current.onViewDetails(area(AREA_KIND.HOTSPOT));
    result.current.onViewPastDetails(area(AREA_KIND.HOTSPOT), { runId: 'r1', day: '2026-10-01' });
    expect(onNavigate.mock.calls.map(([, p]) => [p.scope.dimensions, p.scope.principle])).toEqual([
      [['security'], 'Authenticity'], [['security'], 'Authenticity'],
    ]);
  });
});
