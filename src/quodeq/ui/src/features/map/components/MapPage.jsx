import { useId } from 'react';
import { GalaxyView, GalaxyFolderView, VizBreadcrumb } from '../viz/index.js';
import { complianceRatio } from '../../../utils/formatters.js';
import useMapPageState from './useMapPageState.js';
import PageToolbar from '../../../components/PageToolbar.jsx';
import { useDeferredReady } from '../../../components/DeferredMount.jsx';
import { MapLoadingState, MapNoDimensionsState, MapNoProjectsState, MapNoProjectSelectedState } from './MapPageStates.jsx';
import SharedReadOnlyBadge from '../../../components/SharedReadOnlyBadge.jsx';
import { useThemeIsDark } from '../../../hooks/useThemeIsDark.js';
import { t } from '../../../strings/index.js';
import { DATA_THEME_ATTR } from '../../../constants.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { PACK_COLOR_MODES, VIZ_STYLE, GALAXY_MODE, ACTIVITY_SOURCE, PACK_COLOR_MODE } from '../mapVocab.js';
import useMapActivity from '../hooks/useMapActivity.js';
import useMapTimelapse from '../hooks/useMapTimelapse.js';
import MapPackPanel from './MapPackPanel.jsx';
import MapRiskPanel from './MapRiskPanel.jsx';
import MapTimelapseFooter from './MapTimelapseFooter.jsx';
import MapVizToggles from './MapVizToggles.jsx';
import { DimensionFilter, RiskPrincipleChip, dimensionsFiltered } from './MapDimensionFilter.jsx';
import useRiskState from './useRiskFilter.js';
import { TIMELAPSE_STATUS } from '../model/timelapsePlayback.js';
import { useMapTimelapsePref, useMapLegendPref } from './useMapTimelapsePref.js';
import useRiskActions from './useRiskActions.js';
import useSeverityWeights from '../hooks/useSeverityWeights.js';
import { THEME_FAMILY } from '../../../vocab/theme.js';

// data-theme attr for forcing the viz dark while the app is light: keep the
// active theme family, swap the mode suffix. Attribute values: absent =
// daruma family in system mode; otherwise 'light' | 'dark' | '<family>-<mode>'.
function getDarkThemeAttr() {
  const attr = document.documentElement.getAttribute(DATA_THEME_ATTR) || '';
  const family = attr.replace(/-?(dark|light)$/, '') || THEME_FAMILY.DARUMA;
  return family === THEME_FAMILY.DARUMA ? 'dark' : `${family}-dark`;
}

const VIZ_STYLES = [
  { id: VIZ_STYLE.ZOOMPACK, label: t('map.vizCirclePack'), enabled: true },
  { id: VIZ_STYLE.RISK, label: t('map.vizRisk'), enabled: true },
  { id: VIZ_STYLE.GALAXY, label: t('map.vizGalaxy'), enabled: true },
];

const GALAXY_MODES = [
  { id: GALAXY_MODE.FILESYSTEM, label: t('map.vizFileSystem') },
  { id: GALAXY_MODE.STANDARDS, label: t('map.vizStandards') },
];

// A blocked mode stays focusable (aria-disabled, like the style toggles) so
// keyboard and screen-reader users reach the reason it is unavailable.
function PackColorSeg({ viewMode, setViewMode, activityUnavailable }) {
  const noteId = useId();
  return (
    <div className="term-seg" role="group" aria-label={t('map.colorModeAria')}>
      {PACK_COLOR_MODES.map((m) => {
        const blocked = m.value === PACK_COLOR_MODE.ACTIVITY && activityUnavailable;
        return (
          <button
            key={m.value} type="button" className={`term-btn${viewMode === m.value ? ' term-btn--on' : ''}`}
            onClick={() => !blocked && setViewMode(m.value)} aria-pressed={viewMode === m.value}
            aria-disabled={blocked || undefined} aria-describedby={blocked ? noteId : undefined}
            title={blocked ? t('map.activityUnavailable') : undefined}
          >
            {t(m.labelKey)}
          </button>
        );
      })}
      {activityUnavailable && <span id={noteId} className="sr-only">{t('map.activityUnavailable')}</span>}
    </div>
  );
}

// The Dimensions filter shows on every tab; on Risk it re-measures the areas over the kept dimensions.
function MapControls({ viewState, galaxyState, dimensionState, riskFilter, activityUnavailable }) {
  const { viewMode, setViewMode, vizStyle, setVizStyle } = viewState;
  const { galaxyMode, setGalaxyMode } = galaxyState;
  const { allDimensions, selectedDimensions } = dimensionState;
  return (
    <>
      <DimensionFilter allDimensions={allDimensions} selectedDimensions={selectedDimensions} onToggle={riskFilter.onToggleDimension} onShowOnly={riskFilter.onShowOnlyDimension} />
      {vizStyle === VIZ_STYLE.RISK && <RiskPrincipleChip principle={riskFilter.principle} onClear={riskFilter.clearPrinciple} />}
      {vizStyle === VIZ_STYLE.ZOOMPACK && <PackColorSeg viewMode={viewMode} setViewMode={setViewMode} activityUnavailable={activityUnavailable} />}
      {vizStyle === VIZ_STYLE.GALAXY && (
        <div className="term-seg">
          {GALAXY_MODES.map((m) => (
            <button key={m.id} type="button" className={`term-btn${galaxyMode === m.id ? ' term-btn--on' : ''}`} onClick={() => setGalaxyMode(m.id)} aria-pressed={galaxyMode === m.id}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      <div className="term-seg">
        {VIZ_STYLES.map((s) => (
          <button key={s.id} type="button" className={`term-btn${vizStyle === s.id ? ' term-btn--on' : ''}`} aria-disabled={!s.enabled || undefined} onClick={() => s.enabled && setVizStyle(s.id)} title={!s.enabled ? t('map.comingSoon') : ''} aria-pressed={vizStyle === s.id}>
            {s.label}
          </button>
        ))}
      </div>
    </>
  );
}

function MapBreadcrumb({ path, onNavigate, projectName }) {
  const segments = [{ name: projectName || 'Project', path: '' }, ...path];
  return (
    <VizBreadcrumb
      items={segments.map((seg, i) => ({ label: seg.name, onClick: i < segments.length - 1 ? () => onNavigate(seg.path) : undefined }))}
    />
  );
}

// The Galaxy draws its own trail and Risk has no folder level to show.
function hasBreadcrumb(vizStyle) {
  return vizStyle === VIZ_STYLE.ZOOMPACK;
}

function MapVizContainer({ vizState, treeState, dimensions, callbacks, display, pack, risk, timelapse, dock }) {
  const appIsDark = useThemeIsDark();
  const { vizStyle, viewMode, galaxyMode } = vizState;
  const { fullTree, currentPath, onPathChange } = treeState;
  const { onDrillDown, onFileClick, onPastDetails, onNavigate, onBreadcrumbNav } = callbacks;
  const { showLabels, darkMode, breadcrumb, resetKey, projectName, standardTypes } = display;
  const riskActions = useRiskActions({ areaState: risk.areaState, selection: risk.selection, onNavigate });
  return (
    <div className={`map-viz-container${dock.shown ? ' has-dock' : ''}${dock.legend.on ? '' : ' hide-legends'}`} {...(darkMode && !appIsDark ? { [DATA_THEME_ATTR]: getDarkThemeAttr() } : {})}>
      {hasBreadcrumb(vizStyle) && <MapBreadcrumb path={breadcrumb} onNavigate={onBreadcrumbNav} projectName={projectName} />}
      <MapVizToggles display={display} appIsDark={appIsDark} timelapseToggle={dock.toggle} legendToggle={dock.legend} />
      <div className="map-viz-area">
      {vizStyle === VIZ_STYLE.RISK && (
        <MapRiskPanel risk={risk} riskActions={riskActions} view={{ dark: darkMode || appIsDark, showLabels, resetKey }} timelapse={timelapse} />
      )}
      {vizStyle === VIZ_STYLE.ZOOMPACK && (
        <MapPackPanel
          view={{ fullTree, viewMode, dark: darkMode || appIsDark, showLabels, resetKey, currentPath, onDrillDown, onFileClick, onPastDetails }}
          pack={pack} timelapse={timelapse}
        />
      )}
      {vizStyle === VIZ_STYLE.GALAXY && galaxyMode === GALAXY_MODE.STANDARDS && <GalaxyView dimensions={dimensions} onNavigate={onNavigate} showLabels={showLabels} darkMode={darkMode} resetKey={resetKey} projectName={projectName} standardTypes={standardTypes} />}
      {vizStyle === VIZ_STYLE.GALAXY && galaxyMode === GALAXY_MODE.FILESYSTEM && <GalaxyFolderView node={fullTree} currentPath={currentPath} onPathChange={onPathChange} onFileClick={onFileClick} showLabels={showLabels} darkMode={darkMode} resetKey={resetKey} projectName={projectName} />}
      </div>
      {dock.shown && <div className="map-timelapse-dock"><MapTimelapseFooter timelapse={timelapse} filtered={dock.filtered} /></div>}
    </div>
  );
}

// Holds the visualisation's slot (same class, so the same flex sizing) on
// the commit that paints the page frame, before the tree and layout run.
function MapVizSkeleton() {
  return <div className="map-viz-container map-viz-container--skeleton" aria-busy="true" aria-hidden="true" />;
}

function nodeSummary(node) {
  const viol = node.violations;
  return `${viol} violation${viol !== 1 ? 's' : ''} · ratio ${complianceRatio(viol, node.compliance)}`;
}

/** The time-lapse dock at the bottom of the map: shown while the time-lapse is on, unless the history has a single run. */
function dockOf(state, timelapse, toggle, legend) {
  const single = timelapse.status === TIMELAPSE_STATUS.READY && timelapse.data.runs.length < 2;
  return {
    toggle,
    legend,
    shown: toggle.available && toggle.on && !single,
    filtered: state.vizState.vizStyle === VIZ_STYLE.ZOOMPACK && dimensionsFiltered(state.dimensionState),
  };
}

function MapBody({ ready, state, pack, risk, timelapse, timelapseToggle, legendToggle }) {
  if (!ready) return <MapVizSkeleton />;
  return (
    <MapVizContainer vizState={state.vizState} treeState={state.treeState} dimensions={state.dimensions} callbacks={state.callbacks}
      display={state.display} pack={pack} risk={risk} timelapse={timelapse} dock={dockOf(state, timelapse, timelapseToggle, legendToggle)} />
  );
}

// The pack's severity weights and edit counts; Concentration never waits on
// the history, and the history is fetched only while the pack is on screen.
function useMapPackData(project, source, packShown) {
  const { activity, loading, failed } = useMapActivity(project, source, packShown);
  const weights = useSeverityWeights(project, source);
  const activityUnavailable = source === PROJECT_SOURCE.SHARED || (activity.source === ACTIVITY_SOURCE.NONE && !loading);
  return { pack: { weights, activity, loading, failed }, activityUnavailable };
}

const hasTimelapse = (vizStyle) => vizStyle === VIZ_STYLE.ZOOMPACK || vizStyle === VIZ_STYLE.RISK;

/** The time-lapse switch: offered on the Circle Pack and Risk for local projects; turning it off returns to today. */
function useTimelapseToggle({ vizStyle, source, timelapse, on, setOn }) {
  return {
    available: hasTimelapse(vizStyle) && source !== PROJECT_SOURCE.SHARED,
    on,
    onChange: (v) => { if (!v) timelapse.controls.latest(); setOn(v); },
  };
}

// The time-lapse plays under the Circle Pack and Risk tabs; a Dimensions
// filter holds it on the latest run on the pack, and on Risk plays the
// history the server measured over the filter's selection.
function usePageTimelapse({ project, source, vizStyle, dimensionState, selection, grouping = {}, on }) {
  return useMapTimelapse({
    project, source, granularity: grouping.granularity, onGranularityChange: grouping.onGranularityChange,
    active: on && hasTimelapse(vizStyle),
    blocked: vizStyle === VIZ_STYLE.ZOOMPACK && dimensionsFiltered(dimensionState),
    selection: vizStyle === VIZ_STYLE.RISK ? selection : null,
  });
}

/** The area to open the Risk tab on (an area clicked on the Overview), if any. */
const initialAreaOf = (nav) => nav?.area || null;

export default function MapPage(props) {
  const { data = {}, callbacks = {} } = props;
  const { projects = [], projectsLoaded, selectedProject, selectedSource = PROJECT_SOURCE.LOCAL, projectName, loading, isFetching, error } = data;
  const { onNavigate, onRetry } = callbacks;

  // The first commit paints the header and controls over an empty slot; the
  // tree build and the visualisation follow in a transition (useDeferredReady).
  const ready = useDeferredReady();
  // Call the hook unconditionally to keep hook order stable across renders.
  // The hook tolerates missing data — `state.allDimensions` is `[]` when there
  // is no project or no run data, which is exactly what we use for case C.
  const state = useMapPageState({ ...props, deferTree: !ready });
  const { vizStyle } = state.viewState;
  const { pack, activityUnavailable } = useMapPackData(selectedProject, selectedSource, vizStyle === VIZ_STYLE.ZOOMPACK);
  const { riskFilter, areaState, selection: measuredOver } = useRiskState({
    nav: props.nav, dimensionState: state.dimensionState, project: selectedProject, source: selectedSource, active: vizStyle === VIZ_STYLE.RISK,
  });
  const [timelapseOn, setTimelapseOn] = useMapTimelapsePref();
  const [legendOn, setLegendOn] = useMapLegendPref();
  const timelapse = usePageTimelapse({ project: selectedProject, source: selectedSource, vizStyle, dimensionState: state.dimensionState, selection: riskFilter.selection, grouping: props.grouping, on: timelapseOn });
  const timelapseToggle = useTimelapseToggle({ vizStyle, source: selectedSource, timelapse, on: timelapseOn, setOn: setTimelapseOn });

  if (!projectsLoaded) return <MapLoadingState />;
  if (projects.length === 0 && selectedSource !== PROJECT_SOURCE.SHARED) return <MapNoProjectsState onNavigate={onNavigate} />;
  if (!selectedProject) return <MapNoProjectSelectedState onNavigate={onNavigate} />;
  const isRefreshing = isFetching && !loading;
  if (state.allDimensions.length === 0) {
    return (
      <MapNoDimensionsState
        loading={loading} error={error} isFetching={isFetching} selectedSource={selectedSource}
        selectedProject={selectedProject} projectName={projectName} isRefreshing={isRefreshing}
        onNavigate={onNavigate} onRetry={onRetry}
      />
    );
  }

  const sub = ready ? nodeSummary(state.currentNode) : t('overview.loading');

  return (
    <div className={`map-page map-page--terminal${isRefreshing ? ' section-pending' : ''}`}>
      <PageToolbar title={t('map.termName')} facts={sub} badge={selectedSource === PROJECT_SOURCE.SHARED ? <SharedReadOnlyBadge /> : null}>
        <MapControls viewState={state.viewState} galaxyState={state.galaxyState} dimensionState={state.dimensionState} riskFilter={riskFilter} activityUnavailable={activityUnavailable} />
      </PageToolbar>
      <MapBody ready={ready} state={state} pack={pack} risk={{ areaState, selection: measuredOver, initialArea: initialAreaOf(props.nav) }} timelapse={timelapse} timelapseToggle={timelapseToggle} legendToggle={{ on: legendOn, onChange: setLegendOn }} />
    </div>
  );
}
