import { useState, useRef, useEffect, useId } from 'react';
import { ZoomablePackView, GalaxyView, GalaxyFolderView, VizBreadcrumb, RiskView } from '../viz/index.js';
import { complianceRatio } from '../../../utils/formatters.js';
import useMapPageState from './useMapPageState.js';
import { TermHeader } from '../../../components/terminal/index.js';
import { useDeferredReady } from '../../../components/DeferredMount.jsx';
import { MapLoadingState, MapNoDimensionsState, MapNoProjectsState, MapNoProjectSelectedState } from './MapPageStates.jsx';
import SharedReadOnlyBadge from '../../../components/SharedReadOnlyBadge.jsx';
import { useThemeIsDark } from '../../../hooks/useThemeIsDark.js';
import { t } from '../../../strings/index.js';
import { DATA_THEME_ATTR } from '../../../constants.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { PACK_COLOR_MODES, VIZ_STYLE, GALAXY_MODE, ACTIVITY_SOURCE, PACK_COLOR_MODE } from '../mapVocab.js';
import PackLegend from '../viz/components/PackLegend.jsx';
import useMapActivity from '../hooks/useMapActivity.js';
import useMapAreas from '../hooks/useMapAreas.js';
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
  { id: VIZ_STYLE.GALAXY, label: 'Galaxy', enabled: true },
  { id: VIZ_STYLE.RISK, label: t('map.vizRisk'), enabled: true },
];

const GALAXY_MODES = [
  { id: GALAXY_MODE.FILESYSTEM, label: t('map.vizFileSystem') },
  { id: GALAXY_MODE.STANDARDS, label: 'Standards' },
];

function DimensionFilter({ allDimensions, selectedDimensions, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (allDimensions.length <= 1) return null;

  const isFiltered = selectedDimensions.size !== allDimensions.length;

  return (
    <div className="map-filter-wrap" ref={ref}>
      <button
        type="button"
        className={`term-btn map-filter-btn${isFiltered ? ' is-filtered' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={isFiltered ? t('map.dimensionsOf', { selected: selectedDimensions.size, total: allDimensions.length }) : t('map.allDimensions')}
        aria-label={isFiltered ? t('map.dimensionsAria', { selected: selectedDimensions.size, total: allDimensions.length }) : t('map.dimensions')}
      >
        {t('map.dimensions')} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="map-filter-dropdown">
          {allDimensions.map((dim) => (
            <label key={dim} className="map-filter-item">
              <input type="checkbox" checked={selectedDimensions.has(dim)} onChange={() => onToggle(dim)} />
              <span>{dim}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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

function MapControls({ viewState, galaxyState, dimensionState, activityUnavailable }) {
  const { viewMode, setViewMode, vizStyle, setVizStyle } = viewState;
  const { galaxyMode, setGalaxyMode } = galaxyState;
  const { allDimensions, selectedDimensions, onToggleDimension } = dimensionState;
  return (
    <div className="term-page-top__controls map-controls">
      {vizStyle !== VIZ_STYLE.RISK && <DimensionFilter allDimensions={allDimensions} selectedDimensions={selectedDimensions} onToggle={onToggleDimension} />}
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
    </div>
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

function MapVizContainer({ vizState, treeState, dimensions, callbacks, display, pack, risk }) {
  const appIsDark = useThemeIsDark();
  const { vizStyle, viewMode, galaxyMode } = vizState;
  const { fullTree, currentPath, onPathChange, explicitPath } = treeState;
  const { onDrillDown, onFileClick, onNavigate, onBreadcrumbNav } = callbacks;
  const { showLabels, setShowLabels, darkMode, setDarkMode, breadcrumb, resetKey, projectName, standardTypes } = display;
  const riskActions = useRiskActions({ areaState: risk.areaState, fullTree, onNavigate, onShowInPack: risk.onShowInPack });
  return (
    <div className="map-viz-container" {...(darkMode && !appIsDark ? { [DATA_THEME_ATTR]: getDarkThemeAttr() } : {})}>
      {hasBreadcrumb(vizStyle) && <MapBreadcrumb path={breadcrumb} onNavigate={onBreadcrumbNav} projectName={projectName} />}
      <div className="map-viz-toggles">
        <label className="map-label-toggle">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          {t('map.labels')}
        </label>
        {!appIsDark && (
          <label className="map-label-toggle">
            <input type="checkbox" checked={!darkMode} onChange={(e) => setDarkMode(!e.target.checked)} />
            {t('map.light')}
          </label>
        )}
      </div>
      {vizStyle === VIZ_STYLE.RISK && (
        <RiskView
          areaState={risk.areaState} dark={darkMode || appIsDark} showLabels={showLabels} resetKey={resetKey}
          onViewDetails={riskActions.onViewDetails} onShowInPack={riskActions.onShowInPack}
        />
      )}
      {vizStyle === VIZ_STYLE.ZOOMPACK && (
        <ZoomablePackView
          node={fullTree} colorMode={viewMode} weights={pack.weights} editsByPath={pack.activity.editsByPath}
          dark={darkMode || appIsDark} onDrillDown={onDrillDown} onFileClick={onFileClick}
          showLabels={showLabels} resetKey={resetKey} currentPath={currentPath} autoOpen={!explicitPath}
        />
      )}
      {vizStyle === VIZ_STYLE.ZOOMPACK && (
        <PackLegend
          mode={viewMode} activityLoading={pack.loading}
          activitySource={pack.failed ? ACTIVITY_SOURCE.NONE : pack.activity.source}
        />
      )}
      {vizStyle === VIZ_STYLE.GALAXY && galaxyMode === GALAXY_MODE.STANDARDS && <GalaxyView dimensions={dimensions} onNavigate={onNavigate} showLabels={showLabels} darkMode={darkMode} resetKey={resetKey} projectName={projectName} standardTypes={standardTypes} />}
      {vizStyle === VIZ_STYLE.GALAXY && galaxyMode === GALAXY_MODE.FILESYSTEM && <GalaxyFolderView node={fullTree} currentPath={currentPath} onPathChange={onPathChange} onFileClick={onFileClick} showLabels={showLabels} darkMode={darkMode} resetKey={resetKey} projectName={projectName} />}
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

function MapBody({ ready, state, pack, risk }) {
  if (!ready) return <MapVizSkeleton />;
  return <MapVizContainer vizState={state.vizState} treeState={state.treeState} dimensions={state.dimensions} callbacks={state.callbacks} display={state.display} pack={pack} risk={risk} />;
}

// The pack's severity weights and edit counts; Concentration never waits on
// the history, and the history is fetched only while the pack is on screen.
function useMapPackData(project, source, packShown) {
  const { activity, loading, failed } = useMapActivity(project, source, packShown);
  const weights = useSeverityWeights(project, source);
  const activityUnavailable = source === PROJECT_SOURCE.SHARED || (activity.source === ACTIVITY_SOURCE.NONE && !loading);
  return { pack: { weights, activity, loading, failed }, activityUnavailable };
}

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
  const { pack, activityUnavailable } = useMapPackData(selectedProject, selectedSource, state.viewState.vizStyle === VIZ_STYLE.ZOOMPACK);
  const areaState = useMapAreas(selectedProject, selectedSource, state.viewState.vizStyle === VIZ_STYLE.RISK);

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
      <div className="term-page-top map-page__top">
        <TermHeader
          name="map"
          sub={sub}
          badge={selectedSource === PROJECT_SOURCE.SHARED ? <SharedReadOnlyBadge /> : null}
        />
        <MapControls viewState={state.viewState} galaxyState={state.galaxyState} dimensionState={state.dimensionState} activityUnavailable={activityUnavailable} />
      </div>
      <MapBody ready={ready} state={state} pack={pack} risk={{ areaState, onShowInPack: props.nav?.onShowInPack }} />
    </div>
  );
}
