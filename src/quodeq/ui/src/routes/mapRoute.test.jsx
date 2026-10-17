import { describe, it, expect, vi } from 'vitest';
import { mapRoute } from './mapRoute.jsx';

const props = (dashboardData) => ({
  dashboardData: { accumulated: null, dashboard: null, ...dashboardData },
  navigation: { navStackLength: 1, navStack: [], projects: [], projectsLoaded: true, handleNavigate: vi.fn(), handleNavigateReplace: vi.fn() },
});

describe('mapRoute', () => {
  it('hands the app\'s history grouping to the Map, so the time-lapse plays by the Overview\'s period', () => {
    const onGranularityChange = vi.fn();
    const element = mapRoute({}, props({ granularity: 'month', onGranularityChange }));
    expect(element.props.grouping).toEqual({ granularity: 'month', onGranularityChange });
  });

  it('opens the Map filtered by a link\'s dimensions and principle', () => {
    const element = mapRoute({ vizStyle: 'risk', dimensions: ['security'], principle: 'P1', area: 'app' }, props({}));
    expect(element.props.nav).toMatchObject({ vizStyle: 'risk', dimensions: ['security'], principle: 'P1', area: 'app' });
  });

  it('drops the link\'s filter from the entry once the filter is changed on the page', () => {
    const p = props({});
    mapRoute({ vizStyle: 'risk', dimensions: ['security'], principle: 'P1', _tabKey: 3 }, p).props.nav.onFilterEdited();
    expect(p.navigation.handleNavigateReplace).toHaveBeenCalledWith('map', { vizStyle: 'risk', dimensions: undefined, principle: undefined, _tabKey: 3 });
  });

  it('leaves an entry without a link\'s filter alone', () => {
    const p = props({});
    mapRoute({ vizStyle: 'risk' }, p).props.nav.onFilterEdited();
    expect(p.navigation.handleNavigateReplace).not.toHaveBeenCalled();
  });

  it('a tab change drops an old entry\'s pack colour, so the new tab keeps its own', () => {
    const p = props({});
    mapRoute({ vizStyle: 'zoompack', viewMode: 'activity', _tabKey: 2 }, p).props.nav.onVizStyleChange('zoompack');
    expect(p.navigation.handleNavigateReplace).toHaveBeenCalledWith('map', { vizStyle: 'zoompack', viewMode: undefined, _tabKey: 2 });
  });
});
