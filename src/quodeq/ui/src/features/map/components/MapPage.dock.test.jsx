import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MapPage from './MapPage.jsx';
import { stubPackCanvas } from '../../../test-utils/packFixture.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';
import { STORAGE_FLAG_ON, STORAGE_FLAG_OFF } from '../../../adapters/storage.js';

const TIMELAPSE_KEY = 'quodeq-map-timelapse';
const LEGEND_KEY = 'quodeq-map-legend';
beforeEach(() => { stubPackCanvas(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const FORMULA = { current: { severityWeight: { critical: 4, major: 2, minor: 0.25 } } };
const DIMS = [{ dimension: 'security', violations: [{ file: 'src/a.py', severity: 'minor', principle: 'P1' }], compliance: [] }];
const frame = (day, files) => ({ day, new: 1, fixed: 0, areas: [], files, gone: [] });
const HISTORY = {
  activitySource: 'git', fileNames: ['src/a.py', 'src/b.py'], fileArea: ['x', 'x'], fileLayer: ['', ''], frameEncoding: 'delta',
  frames: [frame('2026-09-01', [[0, 1, 1, 1, 0, 0, 0, 0]]), frame('2026-09-08', [[1, 2, 1, 1, 0, 1, 0, 0]])],
};
const data = (over) => ({
  accumulated: { dimensions: DIMS }, dashboard: null, projectName: 'p1', projects: [{ id: 'p1', name: 'p1' }], projectsLoaded: true,
  selectedProject: 'p1', selectedSource: 'local', loading: false, isFetching: false, ...over,
});
const api = (history = HISTORY) => ({ getMapHistory: vi.fn().mockResolvedValue(history), getGradeFormula: vi.fn().mockResolvedValue(FORMULA) });
function page({ fake = api(), nav, grouping, source } = {}) {
  const view = render(<MapPage data={data(source && { selectedSource: source })} callbacks={{}} nav={nav} grouping={grouping} />, { wrapper: withStableQueryApi(fake) });
  return { ...view, fake };
}
const toggle = (key) => screen.queryByRole('checkbox', { name: t(key) });
const bar = () => screen.queryByRole('group', { name: t('map.timelapseAria') });
const container = () => document.querySelector('.map-viz-container');

describe('MapPage: the Time-lapse switch', () => {
  it('is off by default: no dock, and the whole history is never fetched', () => {
    const { fake } = page();
    expect(toggle('map.timelapseToggle')).not.toBeChecked();
    expect(document.querySelector('.map-timelapse-dock')).toBeNull();
    expect(fake.getMapHistory).not.toHaveBeenCalledWith('p1', 'all');
  });

  it('turned on, the bar shows in the dock along the map\'s bottom edge, and the choice is kept', async () => {
    page();
    fireEvent.click(toggle('map.timelapseToggle'));
    expect(await screen.findByRole('group', { name: t('map.timelapseAria') })).toBeInTheDocument();
    expect(document.querySelector('.map-timelapse-dock')).toContainElement(bar());
    expect(container()).toHaveClass('has-dock');
    expect(localStorage.getItem(TIMELAPSE_KEY)).toBe(STORAGE_FLAG_ON);
  });

  it('turned off on a past run, it returns to today and the dock goes; on again, it opens on today', async () => {
    localStorage.setItem(TIMELAPSE_KEY, STORAGE_FLAG_ON);
    page();
    fireEvent.click(await screen.findByRole('button', { name: t('map.timelapseFirst') }));
    fireEvent.click(toggle('map.timelapseToggle'));
    expect(bar()).toBeNull();
    expect(document.querySelector('.map-stage__layer:not(.map-stage__layer--past)')).not.toHaveClass('is-hidden');
    expect(localStorage.getItem(TIMELAPSE_KEY)).toBe(STORAGE_FLAG_OFF);
    fireEvent.click(toggle('map.timelapseToggle'));
    expect(await screen.findByRole('slider')).toHaveAttribute('aria-valuenow', '2');
  });

  it('a history of one run shows no dock even when on', async () => {
    localStorage.setItem(TIMELAPSE_KEY, STORAGE_FLAG_ON);
    const { fake } = page({ fake: api({ ...HISTORY, frames: HISTORY.frames.slice(0, 1) }) });
    await vi.waitFor(() => expect(fake.getMapHistory).toHaveBeenCalledWith('p1', 'all'));
    await vi.waitFor(() => expect(document.querySelector('.map-timelapse-dock')).toBeNull());
    expect(container()).not.toHaveClass('has-dock');
  });

  it('is offered on Risk too, but not on Galaxy nor for a shared project', () => {
    const { unmount } = page({ nav: { vizStyle: 'risk' } });
    expect(toggle('map.timelapseToggle')).not.toBeNull();
    unmount();
    page({ nav: { vizStyle: 'galaxy' } });
    expect(toggle('map.timelapseToggle')).toBeNull();
    cleanup();
    page({ source: 'shared' });
    expect(toggle('map.timelapseToggle')).toBeNull();
  });
});

describe('MapPage: the time-lapse plays by the app\'s grouping', () => {
  it('the settings show the Overview\'s period, and a pick goes back to it', async () => {
    localStorage.setItem(TIMELAPSE_KEY, STORAGE_FLAG_ON);
    const onGranularityChange = vi.fn();
    page({ grouping: { granularity: 'week', onGranularityChange } });
    await screen.findByRole('group', { name: t('map.timelapseAria') });
    fireEvent.click(document.querySelector('.map-timelapse__settings-btn'));
    expect(screen.getByRole('button', { name: t('map.timelapsePeriodWeek') })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: t('map.timelapsePeriodMonth') }));
    expect(onGranularityChange).toHaveBeenCalledWith('month');
  });
});

describe('MapPage: the Legend switch', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../styles/map.css'), 'utf8');

  it('is on by default; off, it hides every map legend, and the choice is kept', () => {
    page();
    expect(toggle('map.legendToggle')).toBeChecked();
    expect(container()).not.toHaveClass('hide-legends');
    fireEvent.click(toggle('map.legendToggle'));
    expect(container()).toHaveClass('hide-legends');
    expect(localStorage.getItem(LEGEND_KEY)).toBe(STORAGE_FLAG_OFF);
    expect(css).toMatch(/\.map-viz-container\.hide-legends \.pack-legend\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('a stored off keeps the legends hidden on the next visit', () => {
    localStorage.setItem(LEGEND_KEY, STORAGE_FLAG_OFF);
    page();
    expect(toggle('map.legendToggle')).not.toBeChecked();
    expect(container()).toHaveClass('hide-legends');
  });
});
