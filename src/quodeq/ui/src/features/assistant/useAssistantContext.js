import { useAppState } from '../../hooks/useAppState.js';
import { useAssistantProvider } from '../settings/hooks/useAssistantProvider.js';
import { PROJECT_SOURCE } from '../../vocab/projectSource.js';
import { projectId } from '../../utils/projectIdentity.js';

// Route params the model has no use for: the page id is emitted on its own
// and _tabKey only counts fresh clicks on a sidebar tab.
const OMITTED_PAGE_PARAMS = Object.freeze({ page: true, _tabKey: true });
// What one page param may add to the per-turn prompt.
const MAX_PARAM_STRING = 200; // characters: a path or a note, never a code snippet
const MAX_PARAM_ITEMS = 20; // array members or object fields

function isScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function clipScalar(value) {
  return typeof value === 'string' && value.length > MAX_PARAM_STRING ? value.slice(0, MAX_PARAM_STRING) : value;
}

/**
 * A route param reduced to what belongs in a prompt: scalars, arrays of
 * scalars, and one level of object fields that are either. The nested
 * objects some entries carry (a finding's full graph, a file record's
 * findings) are dropped; the tools fetch those by id when asked.
 */
function compactParam(value, nested = false) {
  if (value == null) return undefined;
  if (isScalar(value)) return clipScalar(value);
  if (Array.isArray(value)) {
    const items = value.filter(isScalar).slice(0, MAX_PARAM_ITEMS).map(clipScalar);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value !== 'object' || nested) return undefined;
  const fields = {};
  for (const [key, member] of Object.entries(value).slice(0, MAX_PARAM_ITEMS)) {
    const compact = compactParam(member, true);
    if (compact !== undefined) fields[key] = compact;
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * The nav-stack entry the user is on, as `{ page, pageParams }`: the page id
 * (a NAV_TAB value, drill-down pages included) and its compacted route
 * params, so "this folder", "this file" or "this finding" resolve without
 * the user naming them. Empty when there is no active page.
 */
export function pageState(activePage) {
  if (!activePage?.page) return {};
  const pageParams = {};
  for (const [key, value] of Object.entries(activePage)) {
    if (OMITTED_PAGE_PARAMS[key]) continue;
    const compact = compactParam(value);
    if (compact !== undefined) pageParams[key] = compact;
  }
  const out = { page: activePage.page };
  if (Object.keys(pageParams).length > 0) out.pageParams = pageParams;
  return out;
}

/**
 * Canonical id/name for the selected project, so the session key and the
 * backend runDir lookup agree with the rest of the app (which keys on
 * projectId). Falls back to the raw selection while the projects list
 * has not loaded, and to undefined when nothing is selected.
 */
function resolveProjectId(selectedProject, projects) {
  const found = selectedProject && Array.isArray(projects)
    ? projects.find((p) => projectId(p) === selectedProject)
    : null;
  return found ? projectId(found) : (selectedProject || undefined);
}

/**
 * The UI slice the model reads to pick its data source. `view` names the
 * active tab: overview/history means the accumulated view (get_overview), a
 * concrete run means the run-scoped tools. `selectedRun` and
 * `currentOverviewRun` carry the concrete run when one is shown, so "this
 * run" resolves correctly. `page` and `pageParams` name the exact page under
 * the tab (see {@link pageState}). Optional keys are only set when they have
 * a value, so an absent one reads as absent rather than as undefined.
 */
function buildUiState(appState, dimension) {
  const {
    activeTab, selectedProject, selectedRun, activePage,
    currentOverviewRun, granularity, dailyRuns, overviewRunIndex,
  } = appState;
  const uiState = { view: activeTab, activeTab, selectedProject, selectedRun, ...pageState(activePage) };
  if (currentOverviewRun) uiState.currentOverviewRun = currentOverviewRun;
  if (dimension) uiState.dimension = dimension;
  if (granularity) uiState.grouping = granularity;
  const overviewDate = Array.isArray(dailyRuns) ? dailyRuns[overviewRunIndex]?.dateLabel : undefined;
  if (overviewDate) uiState.overviewDate = overviewDate;
  return uiState;
}

/**
 * Pure derivation of the assistant's live context from the app state and the
 * assistant provider gate. Kept side-effect-free so it can be unit-tested and
 * memoized without mounting the whole app.
 *
 * @param {Object} appState  from useAppState(): activeTab, selectedProject, selectedRun, projects,
 *                            currentOverviewRun, granularity, dailyRuns, overviewRunIndex, activePage,
 *                            selectedSource
 * @param {Object} gate      from useAssistantProvider(): activeProvider, model
 * @returns {{ provider: string, model: string, projectId: string|undefined, runId: string|undefined, source: 'local'|'shared', uiState: { activeTab: string, selectedProject: string, selectedRun: string, page?: string, pageParams?: Object, dimension?: string, grouping?: string, overviewDate?: string } }}
 */
export function deriveAssistantContext(appState, gate) {
  const state = appState || {};
  const { selectedProject, selectedRun, projects, activePage, selectedSource } = state;

  return {
    provider: gate?.activeProvider,
    model: gate?.model,
    projectId: resolveProjectId(selectedProject, projects),
    // Only bind a run when the user EXPLICITLY selected one. On the overview
    // we deliberately send no runId: the session stays run-unscoped and the
    // detail tools (get_report/get_scores/get_violations) read the
    // accumulated view -- each dimension's latest run, aggregated, matching
    // the dashboard -- rather than locking to one whole run (which would show
    // stale data for dimensions whose latest run is newer). currentOverviewRun
    // still rides along in uiState so "this run" resolves, but it does not
    // scope the session.
    runId: selectedRun || undefined,
    source: selectedSource || PROJECT_SOURCE.LOCAL,
    uiState: buildUiState(state, activePage?.dimension),
  };
}

/**
 * Thin hook wrapper: reads live app state + the assistant gate and delegates
 * to the pure {@link deriveAssistantContext}. Callers that already hold an
 * app-state object (e.g. App.jsx) should call `deriveAssistantContext`
 * directly to avoid re-invoking the heavy `useAppState` hook.
 */
export function useAssistantContext() {
  const appState = useAppState();
  const gate = useAssistantProvider();
  return deriveAssistantContext(appState, gate);
}

export default useAssistantContext;
