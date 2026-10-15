/**
 * RiskAreasPanel: the functional areas that need rework most, as the Map's
 * Risk tab places them: fix first then watch, on the absolute lines. Over
 * every finding (the Overview) it lists those two zones. Over some
 * `dimensions` (a dimension page), whose findings alone seldom reach the
 * lines, the healthy areas follow them, and each area says how many times
 * the selection's average its density is (its lift, which orders the areas
 * within a zone and never moves one into another). A row opens the area's
 * findings (a scoped Findings view, as the Map's View details does, over the
 * same dimensions); the map icon at its end opens the Risk tab with that
 * area selected. The foot counts both zones and links to the whole sky.
 * With nothing to list it says so in one line.
 */
import { cloneElement, useMemo } from 'react';
import { GridTable, GridRow, GridCell, SectionLabel } from '../../../components/terminal/index.js';
import { t, LOCALE } from '../../../strings/index.js';
import useRiskAreas from '../hooks/useRiskAreas.js';
import { reworkSummary } from '../model/rankedAreas.js';
import { SKY_ZONE, AREA_KIND } from '../mapVocab.js';
import { SeverityAndFilesCells } from '../../../components/SeverityBadges.jsx';
import { ICON_MAP } from '../../../constants/navigation.jsx';
import { areaFindingsScope } from '../model/detailScopes.js';

// Two-line rows, as many as the folders panel shows.
export const AREAS_SHOWN = 5;
const DENSITY_DECIMALS = 2;
const LIFT_DECIMALS = 1;
/** Name, zone chip, density, severities, files; then the map icon when the panel can open the Map. */
const AREA_COLUMNS = 'minmax(0, 1fr) auto 64px auto 48px';
const AREA_COLUMNS_WITH_MAP = `${AREA_COLUMNS} 28px`;
const ZONE_KEY = {
  [SKY_ZONE.FIX_FIRST]: 'overview.riskZoneFixFirst', [SKY_ZONE.WATCH]: 'overview.riskZoneWatch', [SKY_ZONE.HEALTHY]: 'overview.riskZoneHealthy',
};
const KIND_KEY = { [AREA_KIND.HOTSPOT]: 'map.riskKindHotspot', [AREA_KIND.DORMANT]: 'map.riskKindDormant' };
const NO_DIMENSIONS = [];
// The sidebar's map glyph, a step smaller to sit in a row of text.
const ROW_ICON_SIZE = 14;
const MAP_ICON = cloneElement(ICON_MAP, { width: ROW_ICON_SIZE, height: ROW_ICON_SIZE });

/**
 * The line under an area's name: its kind when it has a ring on the sky and
 * its files; over a selection its lift leads instead of the files (the last
 * column counts them), so the figure is never the part cut off.
 */
function areaSub(area) {
  const kind = KIND_KEY[area.kind] ? t(KIND_KEY[area.kind]) : null;
  if (area.lift != null) {
    return [t('overview.riskLift', { lift: area.lift.toFixed(LIFT_DECIMALS) }), kind].filter(Boolean).join(t('violations.wbDot'));
  }
  return kind ? t('overview.riskAreaSubKind', { kind, files: area.files }) : t('overview.riskAreaSub', { files: area.files });
}

/** The row's end: the area in the Risk map, a button of its own the row's click and keys never reach. */
function AreaMapButton({ area, onClick }) {
  const label = t('overview.riskAreaInMapAria', { name: area.name });
  const stop = (e) => e.stopPropagation();
  return (
    <GridCell align="right">
      <button type="button" className="risk-areas-panel__map" aria-label={label} title={t('overview.riskAreaInMap')}
        onClick={(e) => { stop(e); onClick(area); }} onKeyDown={stop}>
        {MAP_ICON}
      </button>
    </GridCell>
  );
}

function AreaRow({ area, onOpen, onShowInMap }) {
  return (
    <GridRow onClick={onOpen ? () => onOpen(area) : undefined}>
      <GridCell>
        <div className="offending-file-cell">
          <span className="offending-file-name">{area.name}</span>
          <span className="offending-file-path">{areaSub(area)}</span>
        </div>
      </GridCell>
      <GridCell><span className={`risk-zone-chip risk-zone-chip--${area.zone}`}>{t(ZONE_KEY[area.zone])}</span></GridCell>
      <GridCell numeric>{t('overview.riskDensity', { density: area.density.toFixed(DENSITY_DECIMALS) })}</GridCell>
      <SeverityAndFilesCells sev={area.severities} fileCount={area.files} />
      {onShowInMap && <AreaMapButton area={area} onClick={onShowInMap} />}
    </GridRow>
  );
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
  const { areas, files, loading, unavailable } = useRiskAreas({ project, source, dimensions });
  const openArea = useMemo(() => {
    if (!onAreaFindings) return undefined;
    const selection = dimensions.length ? { dimensions } : null;
    return (area) => onAreaFindings(areaFindingsScope(area, files, selection));
  }, [onAreaFindings, dimensions, files]);
  const { rows: rework, fixFirst, watch, total } = useMemo(() => reworkSummary(areas), [areas]);
  // Over a selection every area judged is listed, zones first, then by lift.
  const rows = useMemo(() => (dimensions.length ? areas.filter((a) => a.zone) : rework), [dimensions, areas, rework]);
  if (unavailable || loading || !total) return null;
  return (
    <section className="qd-cards-panel risk-areas-panel" aria-label={t('overview.riskAreasAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('overview.riskAreasLabel')}</SectionLabel>
        <span className="run-history-panel__stats">{t('overview.riskAreasNote')}</span>
      </div>
      {rows.length ? (
        <GridTable columns={onAreaInMap ? AREA_COLUMNS_WITH_MAP : AREA_COLUMNS} dense>
          {rows.slice(0, AREAS_SHOWN).map((area) => <AreaRow key={area.name} area={area} onOpen={openArea} onShowInMap={onAreaInMap} />)}
        </GridTable>
      ) : <div className="risk-areas-panel__none">{t('overview.riskAreasNone')}</div>}
      <div className="panel-foot">
        <span>{t('overview.riskAreasFoot', { areas: total.toLocaleString(LOCALE), fixFirst, watch })}</span>
        {onOpenRisk && <button type="button" className="panel-foot__link" onClick={onOpenRisk}>{t('overview.riskAreasOpen')}</button>}
      </div>
    </section>
  );
}
