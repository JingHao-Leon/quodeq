/**
 * The Compare tab's route renderer, moved out of routes/renderers.jsx
 * verbatim (move-only refactor).
 */
import { lazy } from 'react';
import { PROJECT_SOURCE } from '../vocab/projectSource.js';
import { NAV_TAB } from '../vocab/navTab.js';
import { SCOPE_KIND, openScope } from '../features/violations/scope/scopeModel.js';

const ComparePage = lazy(() => import('../features/compare/components/ComparePage.jsx'));

export function compareRoute(params, props) {
  return (
    <ComparePage
      projects={props.navigation.projects}
      projectsLoaded={props.navigation.projectsLoaded}
      // The dimension drill-down highlights this project by default (radar
      // polygon, standings row, matrix row) until a row is hovered.
      selectedProject={props.navigation.selectedProject}
      dimension={params.dimension || null}
      onOpenProject={(id, source = PROJECT_SOURCE.LOCAL) => {
        // Remote fleet rows open through the shared source; the same
        // machinery the projects drawer uses for shared selections.
        props.navigation.handleProjectChange(id, source);
        props.navigation.navTab(NAV_TAB.OVERVIEW);
      }}
      // Drill-down is a real nav-stack entry: push from the fleet so the
      // browser back button returns there; replace when switching between
      // dimensions so tab-hopping doesn't grow history.
      onOpenDimension={(key) => props.navigation.handleNavigate(NAV_TAB.COMPARE, { dimension: key })}
      onSwitchDimension={(key) => props.navigation.handleNavigateReplace(NAV_TAB.COMPARE, { dimension: key })}
      // A project's principle (matrix cell, principle health, attention
      // item) -> that project's findings on it, the view its own dimension
      // page opens. The project becomes the selection first, as the
      // Findings views read the selected project; pushed, so back pops to
      // Compare. The cell's run is the dimension's latest, so it opens today.
      onOpenProjectPrinciple={(target) => {
        props.navigation.handleProjectChange(target.id, PROJECT_SOURCE.LOCAL);
        openScope(props.navigation.handleNavigate, { kind: SCOPE_KIND.PRINCIPLE, dimension: target.dimName, principle: target.principle });
      }}
      // Standings row -> that project's own screen of the SAME dimension,
      // pushed for the same back-pops-to-Compare contract. The project
      // becomes the selection first, like a fleet row does: the explorer
      // then shows the selected project, so its principles, files,
      // folders, areas and Fix first open the scoped Findings views
      // instead of the cross-project File and principle pages.
      onOpenProjectDimension={(target) => {
        const source = target.source || PROJECT_SOURCE.LOCAL;
        props.navigation.handleProjectChange(target.id, source);
        props.navigation.handleNavigate(NAV_TAB.EXPLORER, {
          dimension: target.dimName,
          runId: target.runId,
          dateLabel: target.dateLabel,
          fromProject: target.id,
          // Named in the crumb: the trail's root is Compare, so without it
          // the trail never says whose dimension this is.
          fromProjectName: target.name,
          fromSource: source,
          sourceTab: NAV_TAB.COMPARE,
        });
      }}
      // Head-to-head is a push like the dimension drill-down: back returns
      // to the fleet with the two-project scope still selected.
      duel={params.duel || null}
      onOpenDuel={(ids) => props.navigation.handleNavigate(NAV_TAB.COMPARE, { duel: ids })}
      onBack={props.navigation.navPop}
    />
  );
}
