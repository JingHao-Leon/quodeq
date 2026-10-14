/**
 * The explorer route's props that depend on whether the entry shows the
 * globally selected project (a Compare entry shows another one).
 */
import { isSharedSource } from './dismissWiring.js';
import { latestRunOf } from './liveSelectors.js';

/** True when an explorer entry shows the globally selected project. */
function showsSelectedProject(params, navigation) {
  const project = params.fromProject || navigation.selectedProject;
  const source = params.fromSource || navigation.selectedSource;
  return project === navigation.selectedProject && isSharedSource(source) === isSharedSource(navigation.selectedSource);
}

/**
 * What an explorer of the selected project borrows: the dashboard's trend (a
 * cross-project entry gets null and reads its own project's history instead
 * of charting the selection's), and today's run of the dimension, which
 * tells its scoped Findings views today from a past run (null: a
 * cross-project explorer keeps the File page).
 */
export function ownProjectProps(params, props) {
  if (!showsSelectedProject(params, props.navigation)) return { trend: null, scopedFindings: null };
  return { trend: props.dashboardData.dashboard?.trend || [], scopedFindings: { latestRunId: latestRunOf(props, params.dimension) } };
}
