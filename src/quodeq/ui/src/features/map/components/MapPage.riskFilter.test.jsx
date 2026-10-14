import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MapPage from './MapPage.jsx';
import { stubPackCanvas } from '../../../test-utils/packFixture.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';
import { STORAGE_FLAG_ON } from '../../../adapters/storage.js';
import { clearAllCachedState } from '../../../utils/pageStateCache.js';

const TIMELAPSE_KEY = 'quodeq-map-timelapse';
beforeEach(() => { stubPackCanvas(); });
// The filter's selection is kept per project in the page-state cache: each test starts unfiltered.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); clearAllCachedState(); });

const FORMULA = { current: { severityWeight: { critical: 4, major: 2, minor: 0.25 } } };
const dim = (dimension) => ({ dimension, violations: [{ file: 'src/a.py', severity: 'minor', principle: 'P1' }], compliance: [] });
const DIMS = [dim('reliability'), dim('security')];
const PATHS = ['src/a.py', 'src/b.py', 'src/c.py'];
const HISTORY = {
  activitySource: 'git', fileNames: PATHS, fileArea: PATHS.map(() => 'app'), fileLayer: PATHS.map(() => ''),
  frames: [
    { day: '2026-09-01', new: 0, fixed: 0, files: PATHS.map((_, i) => [i, 1, 1, 0, 0, 0, 0, 0]), areas: [{ area: 'app', files: 3, density: 1, kind: 'watch', touchedShare: 0 }] },
    { day: '2026-09-08', new: 0, fixed: 0, files: [], areas: [{ area: 'app', files: 3, density: 1, kind: 'watch', touchedShare: 0 }], gone: [] },
  ],
};
const SECURITY = { dimensions: ['security'], principle: '' };

function page(nav) {
  const fake = { getMapHistory: vi.fn().mockResolvedValue(HISTORY), getGradeFormula: vi.fn().mockResolvedValue(FORMULA) };
  const data = {
    accumulated: { dimensions: DIMS }, dashboard: null, projectName: 'p1', projects: [{ id: 'p1', name: 'p1' }], projectsLoaded: true,
    selectedProject: 'p1', selectedSource: 'local', loading: false, isFetching: false,
  };
  render(<MapPage data={data} callbacks={{}} nav={{ vizStyle: 'risk', ...nav }} />, { wrapper: withStableQueryApi(fake) });
  return fake;
}

async function uncheck(dimension) {
  fireEvent.click(await screen.findByRole('button', { name: t('map.dimensions') }));
  fireEvent.click(screen.getByRole('checkbox', { name: dimension }));
}

describe('MapPage: the Dimensions filter on the Risk tab', () => {
  it('measures every finding while every dimension is kept', async () => {
    const fake = page();
    await vi.waitFor(() => expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'latest'));
    expect(fake.getMapHistory.mock.calls.every((call) => call.length === 2)).toBe(true);
  });

  it('re-measures the sky over the dimensions left', async () => {
    const fake = page();
    await uncheck('reliability');
    await vi.waitFor(() => expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'latest', SECURITY));
  });

  it('plays the time-lapse over the same selection', async () => {
    localStorage.setItem(TIMELAPSE_KEY, STORAGE_FLAG_ON);
    const fake = page();
    await uncheck('reliability');
    await vi.waitFor(() => expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'all', SECURITY));
    expect(await screen.findByRole('group', { name: t('map.timelapseAria') })).toBeInTheDocument();
  });
});

describe('MapPage: a link that opens the Risk tab filtered', () => {
  it('opens on the link\'s dimensions', async () => {
    const fake = page({ dimensions: ['security'] });
    await vi.waitFor(() => expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'latest', SECURITY));
    expect(fake.getMapHistory).not.toHaveBeenCalledWith('p1', 'latest');
  });

  it('opens on a principle of one dimension and shows it', async () => {
    const fake = page({ dimensions: ['security'], principle: 'P1' });
    await vi.waitFor(() => expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'latest', { dimensions: ['security'], principle: 'P1' }));
    expect(screen.getByRole('button', { name: t('map.riskPrincipleAria', { name: 'P1' }) })).toBeInTheDocument();
  });

  it('clearing the principle shows the dimension again and drops the link\'s filter from the entry', async () => {
    const onFilterEdited = vi.fn();
    const fake = page({ dimensions: ['security'], principle: 'P1', onFilterEdited });
    fireEvent.click(screen.getByRole('button', { name: t('map.riskPrincipleAria', { name: 'P1' }) }));
    await vi.waitFor(() => expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'latest', SECURITY));
    expect(onFilterEdited).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: t('map.riskPrincipleAria', { name: 'P1' }) })).toBeNull();
  });

  it('ignores a principle without exactly one dimension', async () => {
    const fake = page({ dimensions: ['security', 'reliability'], principle: 'P1' });
    await vi.waitFor(() => expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'latest'));
    expect(screen.queryByRole('button', { name: t('map.riskPrincipleAria', { name: 'P1' }) })).toBeNull();
  });
});
