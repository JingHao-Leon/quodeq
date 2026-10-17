import { describe, it, expect, vi } from 'vitest';
import { compareRoute } from './compareRoute.jsx';
import { ownProjectProps } from './explorerProps.js';

function routeProps() {
  const navigation = {
    projects: [], projectsLoaded: true, selectedProject: 'proj1', selectedSource: 'local',
    handleNavigate: vi.fn(), handleNavigateReplace: vi.fn(), navTab: vi.fn(), navPop: vi.fn(),
  };
  navigation.handleProjectChange = vi.fn((id, source) => {
    navigation.selectedProject = id;
    navigation.selectedSource = source;
  });
  return { navigation, dashboardData: { dashboard: { trend: [] }, latestAccumulated: null } };
}

const TARGET = { id: 'proj2', name: 'Project Two', source: 'local', runId: 'r9', dimName: 'security', dateLabel: 'Fri 16 Oct' };

describe('compareRoute', () => {
  it('opens a standings row on that project\'s dimension page, pushed with Compare still lit', () => {
    const props = routeProps();
    compareRoute({}, props).props.onOpenProjectDimension(TARGET);
    expect(props.navigation.handleNavigate).toHaveBeenCalledWith('explorer', expect.objectContaining({
      dimension: 'security', runId: 'r9', fromProject: 'proj2', fromProjectName: 'Project Two', sourceTab: 'compare',
    }));
  });

  it('makes the row\'s project the selection, so its dimension page opens the scoped Findings views', () => {
    const props = routeProps();
    compareRoute({}, props).props.onOpenProjectDimension(TARGET);
    expect(props.navigation.handleProjectChange).toHaveBeenCalledWith('proj2', 'local');
    const params = props.navigation.handleNavigate.mock.calls[0][1];
    expect(ownProjectProps(params, props).scopedFindings).not.toBeNull();
  });

  it('opens a project\'s principle on its findings, with that project selected', () => {
    const props = routeProps();
    compareRoute({}, props).props.onOpenProjectPrinciple({ id: 'proj2', dimName: 'Security', principle: 'Integrity' });
    expect(props.navigation.handleProjectChange).toHaveBeenCalledWith('proj2', 'local');
    expect(props.navigation.handleNavigate).toHaveBeenCalledWith('violations', {
      scope: { kind: 'principle', dimension: 'Security', principle: 'Integrity' }, asOf: null,
    });
  });
});
