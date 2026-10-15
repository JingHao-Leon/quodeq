import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import useGradeFormula from './useGradeFormula.js';
import { projectKeys, gradeFormulaKeys } from '../../api/queryKeys.js';
import { RescoreTrackerProvider } from './rescore/RescoreTrackerProvider.jsx';

vi.mock('../../api/index.js', () => ({
  getGradeFormula: vi.fn(),
  saveGradeFormula: vi.fn(),
  resetGradeFormula: vi.fn(),
}));

vi.mock('../../utils/gradeThresholds.js', () => ({
  // The hook defaults to the module's shared store instance; mock it so the
  // tests can assert the applied thresholds are pushed without leaking
  // grading state into the process (the very hazard the store fixed).
  defaultGradeThresholdsStore: { set: vi.fn() },
}));

import {
  getGradeFormula, saveGradeFormula, resetGradeFormula,
} from '../../api/index.js';
import { defaultGradeThresholdsStore } from '../../utils/gradeThresholds.js';

// The hook lives inside the React Query provider tree and the app-level
// rescore tracker in the real app, so the tests wrap renderHook in both.
// invalidateSpy lets the apply/reset tests assert the score caches are
// dropped.
let queryClient;
let invalidateSpy;

function wrapper({ children }) {
  return createElement(QueryClientProvider, { client: queryClient },
    createElement(RescoreTrackerProvider, null, children));
}

function renderGradeFormula() {
  return renderHook(() => useGradeFormula(), { wrapper });
}

const CURRENT = {
  severityWeight: { critical: 4, major: 2, minor: 0.25 }, baseK: 5, liftCompress: 0.5, ceilScale: 1,
  floorMinor: 8, floorMajor: 5,
  gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']],
  dimensionWeightsEnabled: false, dimensionWeights: {},
};
const DEFAULTS = { ...CURRENT };

// A pass that already landed: the hook settles on the first render after the
// write, so these tests see the post-rescore effects without polling.
const LANDED_RESCORE = { state: 'idle', generation: 1, appliedGeneration: 1, done: 3, total: 3, failed: 0 };
const IDLE_RESCORE = { state: 'idle', generation: 0, appliedGeneration: 0, done: 0, total: 0, failed: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  getGradeFormula.mockResolvedValue({ current: CURRENT, defaults: DEFAULTS, isCustom: false, rescore: IDLE_RESCORE });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useGradeFormula', () => {
  it('loads params on mount', async () => {
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));
    expect(result.current.defaults).toEqual(DEFAULTS);
    expect(result.current.isCustom).toBe(false);
    expect(result.current.isDirty).toBeFalsy();
  });

  it('update() marks the draft dirty', async () => {
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));
    act(() => { result.current.update({ baseK: 9 }); });
    expect(result.current.draft.baseK).toBe(9);
    expect(result.current.isDirty).toBe(true);
  });

  it('update() clamps floorMinor against the current floorMajor (gradeFormulaRules.clampFloors)', async () => {
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));

    // CURRENT: floorMinor=8, floorMajor=5. Dragging floorMinor down to 3
    // must clamp up to floorMajor (5), matching the sliders' old inline
    // behaviour now centralized in the update() funnel.
    act(() => { result.current.update({ floorMinor: 3 }); });
    expect(result.current.draft.floorMinor).toBe(5);
  });

  it('update() clamps floorMajor against the current floorMinor (gradeFormulaRules.clampFloors)', async () => {
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));

    // CURRENT: floorMinor=8, floorMajor=5. Pushing floorMajor up to 10 must
    // clamp down to floorMinor (8).
    act(() => { result.current.update({ floorMajor: 10 }); });
    expect(result.current.draft.floorMajor).toBe(8);
  });

  it('Undo all (update(saved)) restores both floors and clears the dirty draft', async () => {
    const saved = { ...CURRENT, floorMinor: 5, floorMajor: 3 };
    getGradeFormula.mockResolvedValue({ current: saved, defaults: DEFAULTS, isCustom: true, rescore: IDLE_RESCORE });
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(saved));
    act(() => { result.current.update({ floorMinor: 8 }); });
    act(() => { result.current.update({ floorMajor: 7 }); });
    expect([result.current.draft.floorMinor, result.current.draft.floorMajor]).toEqual([8, 7]);
    act(() => { result.current.update(saved); });
    expect([result.current.draft.floorMinor, result.current.draft.floorMajor]).toEqual([5, 3]);
    expect(result.current.isDirty).toBeFalsy();
  });

  it('update() does not touch floors on an unrelated patch (clampFloors no-op)', async () => {
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));

    act(() => { result.current.update({ gradeThresholds: [[9, 'Exemplary']] }); });
    expect(result.current.draft.floorMinor).toBe(CURRENT.floorMinor);
    expect(result.current.draft.floorMajor).toBe(CURRENT.floorMajor);
  });

  it('clamps a severity weight that would pass its neighbour', async () => {
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));
    act(() => { result.current.update({ severityWeight: { ...CURRENT.severityWeight, minor: 99 } }); });
    expect(result.current.draft.severityWeight.minor).toBeLessThan(result.current.draft.severityWeight.major);
  });

  it('does not refetch the inputs on apply (they do not depend on the formula)', async () => {
    saveGradeFormula.mockResolvedValue({ current: CURRENT, defaults: DEFAULTS, isCustom: true, rescore: LANDED_RESCORE });
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));
    await act(async () => { await result.current.apply(); });
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectKeys.all() }));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: gradeFormulaKeys.inputs() });
  });

  it('apply() saves the draft and pushes thresholds into the gradeThresholds store', async () => {
    const saved = {
      ...CURRENT, baseK: 9,
      gradeThresholds: [[8, 'Exemplary'], [6, 'Good'], [4, 'Adequate'], [2, 'Poor']],
    };
    saveGradeFormula.mockResolvedValue({
      current: saved, defaults: DEFAULTS, isCustom: true, rescore: LANDED_RESCORE,
    });
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));

    let applied;
    await act(async () => { applied = await result.current.apply(); });

    expect(saveGradeFormula).toHaveBeenCalledWith(CURRENT);
    expect(defaultGradeThresholdsStore.set).toHaveBeenCalledWith(saved.gradeThresholds);
    expect(applied).toEqual(LANDED_RESCORE);
    expect(result.current.isCustom).toBe(true);
    expect(result.current.draft).toEqual(saved);
    expect(result.current.isDirty).toBeFalsy();
    // Apply rewrote every run's grades server-side: the cached score/dashboard
    // queries must be invalidated so they refetch.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectKeys.all() }));
  });

  it('resetToDefaults() restores defaults and reseeds the thresholds store', async () => {
    resetGradeFormula.mockResolvedValue({
      current: DEFAULTS, defaults: DEFAULTS, isCustom: false, rescore: LANDED_RESCORE,
    });
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));

    await act(async () => { await result.current.resetToDefaults(); });

    expect(resetGradeFormula).toHaveBeenCalledTimes(1);
    expect(defaultGradeThresholdsStore.set).toHaveBeenCalledWith(DEFAULTS.gradeThresholds);
    expect(result.current.isCustom).toBe(false);
    // Reset also re-baked grades server-side: invalidate the score caches.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectKeys.all() }));
  });

  it('resetToDefaults() reports success with the payload and failure with null', async () => {
    const payload = { current: DEFAULTS, defaults: DEFAULTS, isCustom: false, rescore: LANDED_RESCORE };
    resetGradeFormula.mockResolvedValueOnce(payload).mockRejectedValueOnce(new Error('down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));
    let first;
    let second;
    await act(async () => { first = await result.current.resetToDefaults(); });
    await act(async () => { second = await result.current.resetToDefaults(); });
    expect(first).toEqual(payload);
    expect(second).toBeNull();
  });

  it('apply() reports a failed write with null', async () => {
    saveGradeFormula.mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));
    let applied;
    await act(async () => { applied = await result.current.apply(); });
    expect(applied).toBeNull();
    expect(result.current.error).toBe('Apply failed');
  });

  it('adopting a formula writes its severity weights into the shared formula cache (the Map reads it)', async () => {
    const saved = { ...CURRENT, severityWeight: { critical: 6, major: 3, minor: 1 } };
    saveGradeFormula.mockResolvedValue({ current: saved, defaults: DEFAULTS, isCustom: true, rescore: LANDED_RESCORE });
    queryClient.setQueryData(gradeFormulaKeys.current(), { current: CURRENT, defaults: DEFAULTS, isCustom: false });
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.draft).toEqual(CURRENT));

    await act(async () => { await result.current.apply(); });

    const cached = queryClient.getQueryData(gradeFormulaKeys.current());
    expect(cached.current.severityWeight).toEqual(saved.severityWeight);
    expect(cached.defaults).toEqual(DEFAULTS);
  });

  it('surfaces a load error when the initial GET rejects', async () => {
    getGradeFormula.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderGradeFormula();
    await waitFor(() => expect(result.current.error).toBe('Could not load grade formula'));
  });
});
