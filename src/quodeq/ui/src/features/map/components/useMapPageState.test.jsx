import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMapPageState from './useMapPageState.js';
import { VIZ_STYLE } from '../mapVocab.js';
import { writeVisibleStandardIds } from '../../../utils/visibleStandards.js';
import { createPageStateCache, readCachedState, clearAllCachedState } from '../../../utils/pageStateCache.js';

vi.mock('../../../api/standards.js', () => ({
  listStandards: vi.fn().mockResolvedValue([]),
}));

const dims = (...names) => names.map((dimension) => ({ dimension, id: dimension }));

function setup(props) {
  return renderHook(
    (p) => useMapPageState(p),
    {
      initialProps: {
        data: { projectName: 'proj-x', accumulated: { dimensions: dims('Security', 'Performance') } },
        callbacks: {},
        nav: null,
        tabKey: 0,
        ...props,
      },
    }
  );
}

describe('useMapPageState: pack colour mode', () => {
  it('an old health nav entry opens the pack as concentration', () => {
    const { result } = setup({ nav: { viewMode: 'health' } });
    expect(result.current.viewState.viewMode).toBe('concentration');
  });

  it('activity is kept', () => {
    const { result } = setup({ nav: { viewMode: 'activity' } });
    expect(result.current.viewState.viewMode).toBe('activity');
  });
});

describe('useMapPageState: view style', () => {
  it('an old riskmatrix nav entry opens Risk', () => {
    const { result } = setup({ nav: { vizStyle: 'riskmatrix' } });
    expect(result.current.viewState.vizStyle).toBe(VIZ_STYLE.RISK);
  });

  it('an unknown nav value opens the Circle Pack', () => {
    const { result } = setup({ nav: { vizStyle: 'heatgrid' } });
    expect(result.current.viewState.vizStyle).toBe(VIZ_STYLE.ZOOMPACK);
  });

  it('Galaxy is kept', () => {
    const { result } = setup({ nav: { vizStyle: 'galaxy' } });
    expect(result.current.vizState.vizStyle).toBe(VIZ_STYLE.GALAXY);
  });
});

describe('useMapPageState: page-state cache injection', () => {
  beforeEach(() => {
    localStorage.clear();
    writeVisibleStandardIds(['security', 'performance']);
    clearAllCachedState();
  });

  afterEach(() => {
    localStorage.clear();
    clearAllCachedState();
  });

  it('writes a toggle into an injected cache and leaves the default (module) cache untouched', () => {
    const injected = createPageStateCache();
    const { result } = setup({ cache: injected });

    act(() => { result.current.dimensionState.onToggleDimension('Security'); });

    expect(injected.readCachedState('map', 'proj-x', {}).selectedDimensionsArr).toEqual(['Performance']);
    // The shared, module-lived default cache never saw this write.
    expect(readCachedState('map', 'proj-x', {})).toEqual({});
  });

  it('with no cache prop, the toggle still writes into the default (module) cache -- unchanged production behavior', () => {
    const { result } = setup();

    act(() => { result.current.dimensionState.onToggleDimension('Security'); });

    expect(readCachedState('map', 'proj-x', {}).selectedDimensionsArr).toEqual(['Performance']);
  });
});

describe('useMapPageState: dimension source while accumulated is loading', () => {
  beforeEach(() => {
    localStorage.clear();
    writeVisibleStandardIds(['security', 'performance']);
    clearAllCachedState();
  });

  it('does not use a slim dashboard as the dimension source', () => {
    const { result } = setup({ data: { projectName: 'proj-x', accumulated: null, dashboard: { dimensions: [{ dimension: 'Security', overallScore: '9' }] } } });
    expect(result.current.allDimensions).toEqual([]);
  });

  it('still falls back to a full dashboard', () => {
    const full = [{ dimension: 'Security', violations: [], compliance: [] }];
    const { result } = setup({ data: { projectName: 'proj-x', accumulated: null, dashboard: { dimensions: full } } });
    expect(result.current.allDimensions).toBe(full);
  });
});
