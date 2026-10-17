import { renderHook, waitFor } from '@testing-library/react';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import useMapAreas from './useMapAreas.js';
import useMapActivity from './useMapActivity.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

const PAYLOAD = {
  activitySource: 'git', fileNames: ['a/x.kt'], fileArea: ['article'], fileLayer: ['feature'],
  frames: [{ files: [[0, 2, 1, 3, 0, 1, 4, 1, 0]], areas: [{ area: 'article', files: 1, density: 1.2, kind: 'hotspot', touchedShare: 1 }] }],
};

describe('useMapAreas', () => {
  it('decodes the areas of a local project', async () => {
    const getMapHistory = vi.fn(async () => PAYLOAD);
    const { result } = renderHook(() => useMapAreas('p', PROJECT_SOURCE.LOCAL, true), { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.areaSet.areas).toHaveLength(1));
    expect(result.current.areaSet.areas[0].layers).toEqual(['feature']);
  });

  it('shares one fetch with the pack activity', async () => {
    const getMapHistory = vi.fn(async () => PAYLOAD);
    const { result } = renderHook(() => ({ areas: useMapAreas('p', PROJECT_SOURCE.LOCAL, true), activity: useMapActivity('p', PROJECT_SOURCE.LOCAL, true) }), { wrapper: withStableQueryApi({ getMapHistory }) });
    await waitFor(() => expect(result.current.areas.areaSet.areas).toHaveLength(1));
    expect(result.current.activity.activity.editsByPath.size).toBe(1);
    expect(getMapHistory).toHaveBeenCalledTimes(1);
  });

  it('a shared project reads the shared clone\'s history', async () => {
    const getMapHistory = vi.fn();
    const sharedGetMapHistory = vi.fn(async () => PAYLOAD);
    const { result } = renderHook(() => useMapAreas('p', PROJECT_SOURCE.SHARED, true), { wrapper: withStableQueryApi({ getMapHistory, sharedGetMapHistory }) });
    await waitFor(() => expect(result.current.areaSet.areas).toHaveLength(1));
    expect(sharedGetMapHistory).toHaveBeenCalledWith('p', 'latest');
    expect(getMapHistory).not.toHaveBeenCalled();
  });

  it('an inactive tab does not fetch', () => {
    const getMapHistory = vi.fn();
    renderHook(() => useMapAreas('p', PROJECT_SOURCE.LOCAL, false), { wrapper: withStableQueryApi({ getMapHistory }) });
    expect(getMapHistory).not.toHaveBeenCalled();
  });
});
