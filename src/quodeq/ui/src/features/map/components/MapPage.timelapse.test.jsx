import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MapPage from './MapPage.jsx';
import { stubPackCanvas } from '../../../test-utils/packFixture.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';

beforeEach(() => { stubPackCanvas(); });
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

describe('MapPage: the time-lapse', () => {
  it('a local project with history shows the bar under the Circle Pack', async () => {
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

  it('the Galaxy tab has no bar', () => {
    page({ nav: { vizStyle: 'galaxy' } });
    expect(screen.queryByRole('group', { name: t('map.timelapseAria') })).toBeNull();
  });

  it('a Dimensions filter replaces the bar with a note', async () => {
    page();
    await screen.findByRole('group', { name: t('map.timelapseAria') });
    fireEvent.click(screen.getByRole('button', { name: t('map.dimensions') }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'performance' }));
    expect(screen.getByText(t('map.timelapseFiltered'))).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: t('map.timelapseAria') })).toBeNull();
  });
});
