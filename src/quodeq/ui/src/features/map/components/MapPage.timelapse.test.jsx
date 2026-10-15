import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MapPage from './MapPage.jsx';
import { stubPackCanvas } from '../../../test-utils/packFixture.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';
import { formatShortDate } from '../../../utils/formatters.js';
import { dayDate } from '../viz/core/timelapseBarModel.js';
import { buildTimelapseModel } from '../viz/core/timelapseModel.js';
import { STORAGE_FLAG_ON } from '../../../adapters/storage.js';

// Which runs the past sky computed, and how often the past pack built its model.
const skyRunsAsked = [];
vi.mock('../viz/core/skyTimeline.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createSkyTimeline: (...args) => {
      const timeline = real.createSkyTimeline(...args);
      return { ...timeline, sceneAt: (k) => { skyRunsAsked.push(k); return timeline.sceneAt(k); } };
    },
  };
});
vi.mock('../viz/core/timelapseModel.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, buildTimelapseModel: vi.fn(real.buildTimelapseModel) };
});

// The time-lapse is off until turned on; these tests start with it on (vitest.setup clears storage after each).
beforeEach(() => {
  stubPackCanvas(); skyRunsAsked.length = 0; buildTimelapseModel.mockClear();
  localStorage.setItem('quodeq-map-timelapse', STORAGE_FLAG_ON);
});
// Unmount before the stubs go: a pack layout landing after the test would mount a canvas without them.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const FORMULA = { current: { severityWeight: { critical: 4, major: 2, minor: 0.25 } } };
const DIMS = [
  { dimension: 'security', violations: [{ file: 'src/a.py', severity: 'minor', principle: 'P1' }], compliance: [] },
  { dimension: 'performance', violations: [{ file: 'src/b.py', severity: 'major', principle: 'P2' }], compliance: [] },
];
const frame = (day, files) => ({ day, new: 1, fixed: 0, areas: [], files, gone: [] });
const HISTORY = {
  activitySource: 'git', fileNames: ['src/a.py', 'src/b.py'], fileArea: ['x', 'x'], fileLayer: ['', ''], frameEncoding: 'delta',
  frames: [frame('2026-09-01', [[0, 1, 1, 1, 0, 0, 0, 0]]), frame('2026-09-08', [[1, 2, 1, 1, 0, 1, 0, 0]])],
};
const data = (over) => ({
  accumulated: { dimensions: DIMS }, dashboard: null, projectName: 'p1', projects: [{ id: 'p1', name: 'p1' }], projectsLoaded: true,
  selectedProject: 'p1', selectedSource: 'local', loading: false, isFetching: false, ...over,
});
const api = () => ({ getMapHistory: vi.fn().mockResolvedValue(HISTORY), getGradeFormula: vi.fn().mockResolvedValue(FORMULA) });
const page = (props) => render(<MapPage data={data(props?.data)} callbacks={{}} nav={props?.nav} />, { wrapper: withStableQueryApi(api()) });
const button = (key) => screen.getByRole('button', { name: t(key) });

describe('MapPage: the time-lapse', () => {
  it('a local project with history shows the bar in the dock under the Circle Pack', async () => {
    page();
    expect(await screen.findByRole('group', { name: t('map.timelapseAria') })).toBeInTheDocument();
  });

  it('a shared project shows no bar', () => {
    page({ data: { selectedSource: 'shared' } });
    expect(screen.queryByRole('group', { name: t('map.timelapseAria') })).toBeNull();
  });

  it('going to the first run fades in the past layer', async () => {
    const { container } = page();
    fireEvent.click(await screen.findByRole('button', { name: t('map.timelapseFirst') }));
    expect(container.querySelector('.map-stage__layer--past')).not.toBeNull();
  });

  it('a past run hides the latest pack (and its info panel) from sight and assistive tech', async () => {
    const { container } = page();
    fireEvent.click(await screen.findByRole('button', { name: t('map.timelapseFirst') }));
    const latest = container.querySelector('.map-stage__layer:not(.map-stage__layer--past)');
    expect(latest).toHaveClass('is-hidden');
    expect(latest).toHaveAttribute('aria-hidden', 'true');
  });

  it('back on the latest run the past layer stays mounted, hidden, so a later seek reuses it', async () => {
    const { container } = page();
    fireEvent.click(await screen.findByRole('button', { name: t('map.timelapseFirst') }));
    fireEvent.click(screen.getByRole('button', { name: t('map.timelapseLatest') }));
    const pastLayer = container.querySelector('.map-stage__layer--past');
    expect(pastLayer).toHaveClass('is-hidden');
    expect(pastLayer).toHaveAttribute('aria-hidden', 'true');
  });

  it('seeking again for the same history reuses the past pack: its model is built once', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: t('map.timelapseFirst') }));
    fireEvent.click(button('map.timelapseLatest'));
    fireEvent.click(button('map.timelapseFirst'));
    expect(buildTimelapseModel).toHaveBeenCalledTimes(1);
  });

  it('a jump to the latest run leaves the hidden past sky on its run: today never costs it a sky', async () => {
    page({ nav: { vizStyle: 'risk' } });
    fireEvent.click(await screen.findByRole('button', { name: t('map.timelapseFirst') }));
    await screen.findByRole('img', { name: t('map.timelapseRiskAria', { date: formatShortDate(dayDate('2026-09-01').toISOString()) }) });
    fireEvent.click(button('map.timelapseLatest'));
    await act(async () => {});
    expect(skyRunsAsked).not.toContain(1);
  });

  it('a project switch on a past run shows the new project on its latest run, with no past layer', async () => {
    const view = page();
    fireEvent.click(await screen.findByRole('button', { name: t('map.timelapseFirst') }));
    view.rerender(<MapPage data={data({ projects: [{ id: 'p1', name: 'p1' }, { id: 'p2', name: 'p2' }], selectedProject: 'p2', projectName: 'p2' })} callbacks={{}} />);
    expect(view.container.querySelector('.map-stage__layer--past')).toBeNull();
    expect(await screen.findByRole('slider')).toHaveAttribute('aria-valuenow', '2');
  });

  it('the Galaxy tab has no bar', () => {
    page({ nav: { vizStyle: 'galaxy' } });
    expect(screen.queryByRole('group', { name: t('map.timelapseAria') })).toBeNull();
  });

  it('the Risk tab has the bar too', async () => {
    page({ nav: { vizStyle: 'risk' } });
    expect(await screen.findByRole('group', { name: t('map.timelapseAria') })).toBeInTheDocument();
  });

  it('on the Risk tab the first run fades in the past sky, named by its date', async () => {
    page({ nav: { vizStyle: 'risk' } });
    fireEvent.click(await screen.findByRole('button', { name: t('map.timelapseFirst') }));
    expect(await screen.findByRole('img', { name: t('map.timelapseRiskAria', { date: formatShortDate(dayDate('2026-09-01').toISOString()) }) })).toBeInTheDocument();
  });

  it('a Dimensions filter replaces the bar with a note', async () => {
    page();
    await screen.findByRole('group', { name: t('map.timelapseAria') });
    fireEvent.click(screen.getByRole('button', { name: t('map.dimensions') }));
    fireEvent.click(screen.getByRole('checkbox', { name: t('map.dimensionToggleAria', { name: 'performance' }) }));
    expect(screen.getByText(t('map.timelapseFiltered'))).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: t('map.timelapseAria') })).toBeNull();
  });
});
