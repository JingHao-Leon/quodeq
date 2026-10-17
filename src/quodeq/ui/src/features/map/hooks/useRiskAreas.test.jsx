import { renderHook, waitFor } from '@testing-library/react';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import useRiskAreas from './useRiskAreas.js';
import useMapAreas from './useMapAreas.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

// Five files an area, so the sky draws both (SKY_MIN_FILES).
const FILES_EACH = 5;
const fileNames = ['alpha', 'beta'].flatMap((a) => Array.from({ length: FILES_EACH }, (_, i) => `${a}/f${i}.kt`));
const fileArea = fileNames.map((name) => name.split('/')[0]);
const payload = (lift, density = { alpha: 2, beta: 4 }) => ({
  activitySource: 'git', fileNames, fileArea,
  frames: [{
    files: fileNames.map((_, i) => [i, 2, 1, 0, 0, 1, 0, 0]),
    areas: [
      { area: 'alpha', files: FILES_EACH, density: density.alpha, kind: 'watch', lift: lift.alpha },
      { area: 'beta', files: FILES_EACH, density: density.beta, kind: 'watch', lift: lift.beta },
    ],
  }],
});
const SECURITY = { dimensions: ['security'], principle: '' };

describe('useRiskAreas', () => {
  it('asks for the selection and lists the areas by lift, worst first', async () => {
    const getMapHistory = vi.fn(async () => payload({ alpha: 3, beta: 1.5 }));
    const { result } = renderHook(() => useRiskAreas({ project: 'p', source: PROJECT_SOURCE.LOCAL, dimensions: ['security'] }),
      { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.areas).toHaveLength(2));
    expect(getMapHistory).toHaveBeenCalledWith('p', 'latest', SECURITY);
    expect(result.current.areas.map((a) => [a.name, a.lift, a.zone])).toEqual([['alpha', 3, 'fixFirst'], ['beta', 1.5, 'fixFirst']]);
  });

  it('puts the zones first on the absolute lines, lift ordering within a zone', async () => {
    const getMapHistory = vi.fn(async () => payload({ alpha: 3, beta: 1.5 }, { alpha: 0.6, beta: 1 }));
    const { result } = renderHook(() => useRiskAreas({ project: 'p', source: PROJECT_SOURCE.LOCAL, dimensions: ['security'] }),
      { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.areas).toHaveLength(2));
    expect(result.current.areas.map((a) => [a.name, a.zone])).toEqual([['beta', 'fixFirst'], ['alpha', 'watch']]);
  });

  it('passes a principle with its dimension', async () => {
    const getMapHistory = vi.fn(async () => payload({}));
    renderHook(() => useRiskAreas({ project: 'p', source: PROJECT_SOURCE.LOCAL, dimensions: ['security'], principle: 'Authenticity' }),
      { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(getMapHistory).toHaveBeenCalledWith('p', 'latest', { dimensions: ['security'], principle: 'Authenticity' }));
  });

  it('keeps one cache entry per selection', async () => {
    const getMapHistory = vi.fn(async (_p, _f, selection) => payload(selection ? { alpha: 2, beta: 1 } : {}));
    const { result } = renderHook(() => ({
      plain: useMapAreas('p', PROJECT_SOURCE.LOCAL, true),
      selected: useRiskAreas({ project: 'p', source: PROJECT_SOURCE.LOCAL, dimensions: ['security'] }),
      again: useRiskAreas({ project: 'p', source: PROJECT_SOURCE.LOCAL, dimensions: ['security'] }),
    }), { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.selected.areas).toHaveLength(2));
    await waitFor(() => expect(result.current.plain.areaSet.areas).toHaveLength(2));
    expect(getMapHistory).toHaveBeenCalledTimes(2);
    expect(result.current.plain.areaSet.areas[0].lift).toBeNull();
  });
});
