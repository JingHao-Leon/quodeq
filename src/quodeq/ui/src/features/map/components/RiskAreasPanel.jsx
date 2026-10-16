/**
 * RiskAreasPanel: the functional areas that need rework most, as the Map's
 * Risk tab places them: fix first then watch, on the absolute lines, then
 * the healthy ones, so the panel is never empty while the sky has areas.
 * Over some `dimensions` (a dimension page) each area also says how many
 * times the selection's average its density is (its lift, which orders the
 * areas within a zone and never moves one into another). A row opens the area's
 * findings (a scoped Findings view, as the Map's View details does, over the
 * same dimensions); the map icon at its end opens the Risk tab with that
 * area selected. A strip splits every area into the three zones, and the
 * foot counts them and links to the whole sky.
 * While the areas load, when they fail, or with nothing to list, it keeps
 * its frame and says so in one line, so the switch above never sits alone.
 */
import { useMemo } from 'react';
import { GridTable, GridRow, GridCell, SectionLabel } from '../../../components/terminal/index.js';
import { t, LOCALE } from '../../../strings/index.js';
import useRiskAreas from '../hooks/useRiskAreas.js';
import { reworkSummary } from '../model/rankedAreas.js';
import { SKY_ZONE, AREA_KIND } from '../mapVocab.js';
import { SeverityAndFilesCells, PLACE_COLUMNS } from '../../../components/SeverityBadges.jsx';
import { ROW_MAP_ICON } from '../../../components/rowMapIcon.jsx';
import { areaFindingsScope } from '../model/detailScopes.js';

// Two-line rows, as many as the Fix first panel beside it shows.
export const AREAS_SHOWN = 8;
const DENSITY_DECIMALS = 2;
const LIFT_DECIMALS = 1;
/** The place tables' columns (the zone and density ride under the name); then the map icon when the panel can open the Map. */
const AREA_COLUMNS_WITH_MAP = `${PLACE_COLUMNS} 28px`;
const ZONE_KEY = {
  [SKY_ZONE.FIX_FIRST]: 'overview.riskZoneFixFirst', [SKY_ZONE.WATCH]: 'overview.riskZoneWatch', [SKY_ZONE.HEALTHY]: 'overview.riskZoneHealthy',
};
const KIND_KEY = { [AREA_KIND.HOTSPOT]: 'map.riskKindHotspot', [AREA_KIND.DORMANT]: 'map.riskKindDormant' };
const NO_DIMENSIONS = [];

/**
 * The words after the zone chip under an area's name: its density, its lift
 * over a selection, its kind when it has a ring on the sky. The files are
 * the last column's, never repeated here.
 */
function areaSub(area) {
  const density = t('overview.riskDensity', { density: area.density.toFixed(DENSITY_DECIMALS) });
  const lift = area.lift != null ? t('overview.riskLift', { lift: area.lift.toFixed(LIFT_DECIMALS) }) : null;
  const kind = KIND_KEY[area.kind] ? t(KIND_KEY[area.kind]) : null;
  return [density, lift, kind].filter(Boolean).join(t('violations.wbDot'));
}

/** The row's end: the area in the Risk map, raised above the row's open button. */
function AreaMapButton({ area, onClick }) {
  return (
    <GridCell align="right">
      <button type="button" className="risk-areas-panel__map" aria-label={t('overview.riskAreaInMapAria', { name: area.name })}
        title={t('overview.riskAreaInMap')} onClick={() => onClick(area)}>
        {ROW_MAP_ICON}
      </button>
    </GridCell>
  );
}

/**
 * The area's name and its sub line; with `onOpen` they are a button
 * stretched over the whole row (as .term-stat__hitbox), so a click anywhere
 * on the row opens the area and the map icon stays a sibling, never nested.
 */
function AreaNameCell({ area, onOpen }) {
  const name = (
    <div className="offending-file-cell">
      <span className="offending-file-name">{area.name}</span>
      <span className="offending-file-path risk-areas-panel__sub">
        <span className={`risk-zone-chip risk-zone-chip--${area.zone}`}>{t(ZONE_KEY[area.zone])}</span>
        {areaSub(area)}
      </span>
    </div>
  );
  if (!onOpen) return <GridCell>{name}</GridCell>;
  return (
    <GridCell>
      <button type="button" className="risk-areas-panel__open" aria-label={t('overview.riskAreaOpenAria', { name: area.name })}
        onClick={() => onOpen(area)}>
        {name}
      </button>
    </GridCell>
  );
}

/** The column names, an empty one over the map icons. */
function AreaHeader({ withMap }) {
  return (
    <GridRow header>
      <GridCell>{t('overview.areaCol')}</GridCell>
      <GridCell>{t('overview.sevCol')}</GridCell>
      <GridCell align="right">{t('overview.filesCol')}</GridCell>
      {withMap && <GridCell />}
    </GridRow>
  );
}

function AreaRow({ area, onOpen, onShowInMap }) {
  return (
    <GridRow>
      <AreaNameCell area={area} onOpen={onOpen} />
      <SeverityAndFilesCells sev={area.severities} fileCount={area.files} bare />
      {onShowInMap && <AreaMapButton area={area} onClick={onShowInMap} />}
    </GridRow>
  );
}

const STRIP_ZONES = [SKY_ZONE.FIX_FIRST, SKY_ZONE.WATCH, SKY_ZONE.HEALTHY];

/**
 * Every area judged, split into the three zones on one strip: the share
 * that needs rework against the whole project, not only the top rows.
 */
function ZoneStrip({ fixFirst, watch, total }) {
  const counts = { [SKY_ZONE.FIX_FIRST]: fixFirst, [SKY_ZONE.WATCH]: watch, [SKY_ZONE.HEALTHY]: Math.max(0, total - fixFirst - watch) };
  return (
    <div className="risk-zone-strip" role="img"
      aria-label={t('overview.riskStripAria', { fixFirst, watch, healthy: counts[SKY_ZONE.HEALTHY] })}>
      <div className="risk-zone-strip__bar" aria-hidden="true">
        {STRIP_ZONES.filter((z) => counts[z] > 0).map((z) => (
          <span key={z} className={`risk-zone-strip__seg risk-zone-strip__seg--${z}`} style={{ flex: counts[z] }} />
        ))}
      </div>
      <div className="risk-zone-strip__legend" aria-hidden="true">
        {STRIP_ZONES.map((z) => (
          <span key={z} className="risk-zone-strip__item">
            <span className={`risk-zone-chip risk-zone-chip--${z}`}>{t(ZONE_KEY[z])}</span> {counts[z].toLocaleString(LOCALE)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The panel's frame: its head, then the body. */
function PanelFrame({ children }) {
  return (
    <section className="qd-cards-panel risk-areas-panel" aria-label={t('overview.riskAreasAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('overview.riskAreasLabel')}</SectionLabel>
        <span className="run-history-panel__stats">{t('overview.riskAreasNote')}</span>
      </div>
      {children}
    </section>
  );
}

/** Why there are no rows: still loading, failed (the query retries), or no area the sky draws. */
function statusKey({ loading, failed }) {
  if (loading) return 'map.riskLoading';
  return failed ? 'map.riskFailed' : 'map.riskEmpty';
}

/**
 * @param {object} props
 * @param {string} props.project
 * @param {string} props.source a PROJECT_SOURCE value
 * @param {string[]} [props.dimensions] measure the areas over these dimensions only (none: every finding)
 * @param {(scope: object) => void} [props.onAreaFindings] opens a row's area as a scoped Findings view (an AREA scope)
 * @param {(area: {name: string}) => void} [props.onAreaInMap] opens the Risk tab with the area selected (the row's icon)
 * @param {() => void} [props.onOpenRisk]
 */
export default function RiskAreasPanel({ project, source, dimensions = NO_DIMENSIONS, onAreaFindings, onAreaInMap, onOpenRisk }) {
  const { areas, files, loading, failed } = useRiskAreas({ project, source, dimensions });
  const openArea = useMemo(() => {
    if (!onAreaFindings) return undefined;
    const selection = dimensions.length ? { dimensions } : null;
    return (area) => onAreaFindings(areaFindingsScope(area, files, selection));
  }, [onAreaFindings, dimensions, files]);
  const { fixFirst, watch, total } = useMemo(() => reworkSummary(areas), [areas]);
  // Every area judged, zones first (fix first, watch, healthy), then by lift; too small to judge left out.
  const rows = useMemo(() => areas.filter((a) => a.zone), [areas]);
  if (loading || !rows.length) {
    return <PanelFrame><div className="risk-areas-panel__none">{t(statusKey({ loading, failed }))}</div></PanelFrame>;
  }
  return (
    <PanelFrame>
      <GridTable columns={onAreaInMap ? AREA_COLUMNS_WITH_MAP : PLACE_COLUMNS} dense>
        <AreaHeader withMap={Boolean(onAreaInMap)} />
        {rows.slice(0, AREAS_SHOWN).map((area) => <AreaRow key={area.name} area={area} onOpen={openArea} onShowInMap={onAreaInMap} />)}
      </GridTable>
      <ZoneStrip fixFirst={fixFirst} watch={watch} total={total} />
      <div className="panel-foot">
        <span>{t('overview.riskAreasFootTotal', { areas: total.toLocaleString(LOCALE) })}</span>
        {onOpenRisk && <button type="button" className="panel-foot__link" onClick={onOpenRisk}>{t('overview.riskAreasOpen')}</button>}
      </div>
    </PanelFrame>
  );
}
