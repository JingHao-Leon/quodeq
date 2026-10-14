/**
 * The Violations tab's route renderer, moved out of routes/renderers.jsx
 * verbatim (move-only refactor). onDismiss gating and dismissWithReconcile
 * have regression history -- this file does not touch either (ViolationsPage
 * itself has no onDismiss; dismiss lives on the file/finding/evalprinciple
 * detail routes, which stay in routes/renderers.jsx).
 *
 * ViolationsRoute itself was pulled apart into the helpers below (make...,
 * build...) purely to fit the size ratchet's per-function line cap -- same
 * logic, same closures, just named and factored out instead of inlined.
 */
import { lazy } from 'react';
import { NAV_TAB } from '../vocab/navTab.js';
import { buildEvalPrincipal } from './liveSelectors.js';
import { isSharedSource, makeDismissHandler } from './dismissWiring.js';
import { readAsOf } from '../features/violations/asOf.js';
import { openScope, readScope, scopeAsList, SCOPE_KIND } from '../features/violations/scope/scopeModel.js';

// buildEvalPrincipal moved to routes/liveSelectors.js (the Principle page
// rebuilds it from the live payload there); re-exported for its tests.
export { buildEvalPrincipal };

const ViolationsPage = lazy(() => import('../features/violations/components/ViolationsPage.jsx'));

function buildViolationsData({ props, acc, dims, past }) {
  return {
    asOf: past.asOf,
    scope: past.scope,
    accumulated: acc,
    accumulatedDimensions: dims,
    selectedProject: props.navigation.selectedProject,
    selectedSource: props.navigation.selectedSource,
    projects: props.navigation.projects,
    projectsLoaded: props.navigation.projectsLoaded,
    projectName: props.dashboardData.selectedDisplayName,
    loading: props.dashboardData.loading,
    isFetching: props.dashboardData.isFetching,
    error: props.dashboardData.error,
  };
}

// ViolationsPage does not refresh on mount. Restore/delete (single + bulk)
// route through onReconcile via useDismissedFindings; restore-all/delete-all
// return a payload applyMutationDelta can't patch (scores:null,
// delta.isLatest:false), so those need the debounced ACTIVE reconcile -- see
// scheduleDashboardReconcile in useDashboard.js.
function buildViolationsCallbacks({ props, nav, past }) {
  return {
    // A file opens as a scoped Findings view (its findings as one page), today or that past day, as a new step.
    onFileClick: (fileObj) => past.openFile(fileObj.file),
    onReconcile: props.scheduleDashboardReconcile,
    // The workbench dismisses findings from many runs: each finding carries
    // its dimension's run, and the handler is made per call (undefined for a
    // shared project, which is read-only).
    // A past day is read-only: dismissing acts on today's findings.
    onDismissFinding: isSharedSource(props.navigation.selectedSource) || past.asOf ? undefined
      : (violation, runId) => makeDismissHandler({
        selectedSource: props.navigation.selectedSource,
        runId,
        selectedProject: props.navigation.selectedProject,
        fallbackDimension: violation.dimension,
        deps: props,
      })(violation),
    onNavigate: nav,
    onRetry: props.dashboardData.onRetry,
    onBackToToday: past.asOf ? past.backToToday : undefined,
    onListScope: past.listScope,
  };
}

function buildViolationsPageProps({ params, props, acc, dims, nav, past }) {
  return {
    data: buildViolationsData({ props, acc, dims, past }),
    callbacks: buildViolationsCallbacks({ props, nav, past }),
    // The workbench's search, filters, grouping and selection are view state
    // on the SAME screen: they live in the route entry so back/forward and a
    // round trip through a file restore them, and a change replaces (never
    // pushes) the entry. Params are spread forward so _tabKey survives.
    workbench: params.wb || null,
    onWorkbenchChange: (wb) => props.navigation.handleNavigateReplace(NAV_TAB.VIOLATIONS, { ...params, wb }),
  };
}

/**
 * A past day's view (`params.asOf`, a past run's entry point): the page
 * reads the findings as of that day's last run, read-only, and offers the
 * way back to today (the same entry, without `asOf`). `params.scope` shows
 * one scope's findings (a file, a folder, a dimension...) as one page.
 */
function pastView(params, props) {
  const asOf = readAsOf(params.asOf);
  return {
    asOf,
    scope: readScope(params.scope),
    backToToday: () => props.navigation.handleNavigateReplace(NAV_TAB.VIOLATIONS, { ...params, asOf: null }),
    openFile: (file) => openScope(props.navigation.handleNavigate, { kind: SCOPE_KIND.FILE, path: file }, asOf),
    // The scope as the workbench list: the same step, the scope as its chips.
    listScope: (scope) => props.navigation.handleNavigateReplace(NAV_TAB.VIOLATIONS, {
      asOf, scope: null, wb: { ...scopeAsList(scope), selectedId: null },
    }),
  };
}

export function ViolationsRoute({ params, props }) {
  const past = pastView(params, props);
  const acc = props.dashboardData.latestAccumulated || props.dashboardData.accumulated;
  const dims = acc?.dimensions || [];
  const nav = props.navigation.handleNavigate;

  return (
    <ViolationsPage
      {...buildViolationsPageProps({ params, props, acc, dims, nav, past })}
    />
  );
}
