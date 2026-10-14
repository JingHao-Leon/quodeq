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
});
