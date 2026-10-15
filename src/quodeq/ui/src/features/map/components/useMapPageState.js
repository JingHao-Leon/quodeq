import { hasBodies } from '../../../models/dimension.js';
import { useTabScopedPageState } from '../../../hooks/useTabScopedPageState.js';
import { useDashboardFullHeight } from './useDashboardFullHeight.js';
import { useStandardTypes } from './useStandardTypes.js';
import { useMapDisplayPrefs } from './useMapDisplayPrefs.js';
import { useMapDimensionFilter } from './useMapDimensionFilter.js';
import { useMapTreeState } from './useMapTreeState.js';
import { MAP_VIEW_MODE, VIZ_STYLE, GALAXY_MODE, normalizePackMode, normalizeVizStyle } from '../mapVocab.js';
import { nodeScope, openPastScope } from '../model/detailScopes.js';
import { openScope } from '../../violations/scope/scopeModel.js';

// Re-exported so existing importers of the tree helpers keep one seam; the
// implementations live in mapTree.js (pure, unit-testable without the hook).
export { findSubtree, buildBreadcrumbPath } from './mapTree.js';

// Stable empty input for the tree while the page defers its heavy body.
const EMPTY_DIMENSIONS = [];

/**
 * Drill path and mode/style toggles live in the nav-stack entry (route
 * params), not component state — drilling pushes a history entry, toggling
 * replaces one (see the app's map route renderer), and browser back/forward
 * and the breadcrumb restore them. Defaults apply when a fresh tab entry
 * carries no params yet. Standalone renders (tests) may pass no nav
 * bundle; the setters then no-op.
 */
function useMapNavParams(nav) {
  const {
    path: currentPath = '',
    vizStyle: rawVizStyle,
    viewMode = MAP_VIEW_MODE.HEALTH,
    galaxyMode = GALAXY_MODE.FILESYSTEM,
    onPathChange, onVizStyleChange, onViewModeChange, onGalaxyModeChange,
  } = nav || {};
  const vizStyle = normalizeVizStyle(rawVizStyle);
  return {
    currentPath, vizStyle, galaxyMode,
    viewMode: vizStyle === VIZ_STYLE.ZOOMPACK ? normalizePackMode(viewMode) : viewMode,
    setCurrentPath: (p) => onPathChange?.(p),
    setVizStyle: (v) => onVizStyleChange?.(v),
    setViewMode: (v) => onViewModeChange?.(v),
    setGalaxyMode: (v) => onGalaxyModeChange?.(v),
  };
}

/** Fresh tab click drops the cache; round-tripping through a detail view
 * does not change tabKey, so cached state survives unmount/remount.
 * `cache` is an optional injected page-state cache; with none given this
 * goes through the module's own free functions (the shared default). */
function useMapTabCache(selectedProject, tabKey, cache) {
  return useTabScopedPageState({
    namespace: 'map', scope: selectedProject, tabKey, defaults: { selectedDimensionsArr: [] }, cache,
  });
}

/** Assembles the hook's return object — kept as one literal (not spread
 * pieces) so the return-object keys stay an explicit, reviewable contract
 * for every consumer of useMapPageState. */
function buildMapPageResult({
  allDimensions, viewMode, setViewMode, vizStyle, setVizStyle, galaxyMode, setGalaxyMode,
  dimensionNames, effectiveSelected, handleToggleDimension, handleShowOnlyDimension, currentNode, fullTree, currentPath,
  setCurrentPath, filteredDimensions, handleDrillDown, callbacks, handleBreadcrumbNav,
  showLabels, setShowLabels, darkMode, setDarkMode, breadcrumb, tabKey, projectName, standardTypes,
}) {
  return {
    allDimensions,
    viewState: { viewMode, setViewMode, vizStyle, setVizStyle },
    galaxyState: { galaxyMode, setGalaxyMode },
    dimensionState: { allDimensions: dimensionNames, selectedDimensions: effectiveSelected, onToggleDimension: handleToggleDimension, onShowOnlyDimension: handleShowOnlyDimension },
    vizState: { vizStyle, viewMode, galaxyMode, setGalaxyMode },
    treeState: { node: currentNode, fullTree, currentPath, onPathChange: setCurrentPath },
    dimensions: filteredDimensions,
    callbacks: {
      onDrillDown: handleDrillDown,
      // A node's details are its findings as one page (a scoped Findings view): a file's, a folder's, the project's at the root.
      onFileClick: (treeNode) => { openScope(callbacks?.onNavigate, nodeScope(treeNode)); },
      // A past day's details: the same, as of that day, read-only.
      onPastDetails: (node, run) => openPastScope(callbacks?.onNavigate, nodeScope(node), run),
      onNavigate: callbacks?.onNavigate,
      onBreadcrumbNav: handleBreadcrumbNav,
    },
    display: {
      showLabels, setShowLabels,
      darkMode, setDarkMode,
      breadcrumb,
      resetKey: tabKey,
      projectName,
      standardTypes,
    },
    currentNode,
  };
}

// Per-mount plumbing: the tab-scoped state cache, the viewport lock, and the
// standard types for constellations. No data refresh on mount: the map reads
// the same dashboard payload as every other tab, and marking it stale here
// forced a refetch on the next tab the user opened.
function useMapPageLifecycle({ selectedProject, tabKey, cache }) {
  const cached = useMapTabCache(selectedProject, tabKey, cache);

  // Lock parent to viewport height while map is active.
  useDashboardFullHeight();

  // Standard types for galaxy constellation grouping.
  const { standardTypes } = useStandardTypes();
  return { cached, standardTypes };
}

/**
 * Map page state, as composition: DOM sizing (useDashboardFullHeight), the
 * standards fetch (useStandardTypes), display prefs (useMapDisplayPrefs),
 * the dimension filter (useMapDimensionFilter), the tree (useMapTreeState),
 * and storage via the shared adapters (adapters/storage.js + pageStateCache).
 * `cache` is an optional injected page-state cache (see pageStateCache.js);
 * omit it in production, where every page shares the module-level default.
 * `deferTree` keeps the file tree empty (so buildFileTree over every finding
 * stays off the current commit); the page flips it once its frame has
 * painted.
 */
function treeDimensions(filteredDimensions, deferTree) {
  return deferTree ? EMPTY_DIMENSIONS : filteredDimensions;
}

/** The filter's dimensions on mount: a link's (nav `dimensions`) over the tab's cached selection. */
function initialDimensions(nav, cached) {
  return nav?.dimensions?.length ? nav.dimensions : cached.selectedDimensionsArr;
}

export default function useMapPageState({ data, callbacks, nav, tabKey = 0, cache, deferTree = false }) {
  const selectedProject = data?.projectName || data?.selectedProject || '__map__';
  const {
    currentPath, vizStyle, viewMode, galaxyMode,
    setCurrentPath, setVizStyle, setViewMode, setGalaxyMode,
  } = useMapNavParams(nav);
  const { cached, standardTypes } = useMapPageLifecycle({ selectedProject, tabKey, cache });

  // A slim (overview) dashboard has no bodies to place: wait for accumulated
  // rather than drawing an empty tree from it.
  const dashboardDims = data?.dashboard?.dimensions;
  const allDimensions = data?.accumulated?.dimensions || (hasBodies(dashboardDims) ? dashboardDims : null) || [];

  const { showLabels, setShowLabels, darkMode, setDarkMode } = useMapDisplayPrefs();

  const { dimensionNames, effectiveSelected, handleToggleDimension, handleShowOnlyDimension, filteredDimensions } = useMapDimensionFilter({
    allDimensions, selectedProject, cachedSelectedArr: initialDimensions(nav, cached), cache,
  });

  const { fullTree, currentNode, breadcrumb, handleDrillDown, handleBreadcrumbNav } = useMapTreeState({
    filteredDimensions: treeDimensions(filteredDimensions, deferTree), currentPath, setCurrentPath,
  });

  return buildMapPageResult({
    allDimensions, viewMode, setViewMode, vizStyle, setVizStyle, galaxyMode, setGalaxyMode,
    dimensionNames, effectiveSelected, handleToggleDimension, handleShowOnlyDimension, currentNode, fullTree, currentPath,
    setCurrentPath, filteredDimensions, handleDrillDown, callbacks, handleBreadcrumbNav,
    showLabels, setShowLabels, darkMode, setDarkMode, breadcrumb, tabKey, projectName: data?.projectName, standardTypes,
  });
}
