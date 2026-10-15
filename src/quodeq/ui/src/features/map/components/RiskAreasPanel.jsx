/**
 * RiskAreasPanel: the functional areas that need rework most, as the Map's
 * Risk tab places them: fix first then watch, on the absolute lines. Over
 * every finding (the Overview) it lists those two zones. Over some
 * `dimensions` (a dimension page), whose findings alone seldom reach the
 * lines, the healthy areas follow them, and each area says how many times
 * the selection's average its density is (its lift, which orders the areas
 * within a zone and never moves one into another). A row opens the Risk tab
 * with that area selected; the foot counts both zones and links to the
 * whole sky. With nothing to list it says so in one line.
 */
import { useMemo } from 'react';
import { GridTable, GridRow, GridCell, SectionLabel } from '../../../components/terminal/index.js';
import { t, LOCALE } from '../../../strings/index.js';
import useRiskAreas from '../hooks/useRiskAreas.js';
import { reworkSummary } from '../model/rankedAreas.js';
import { SKY_ZONE, AREA_KIND } from '../mapVocab.js';
import { SeverityAndFilesCells } from '../../../components/SeverityBadges.jsx';

// Two-line rows, as many as the folders panel shows.
export const AREAS_SHOWN = 5;
const DENSITY_DECIMALS = 2;
const LIFT_DECIMALS = 1;
/** Name, zone chip, density, severities, files. */
const AREA_COLUMNS = 'minmax(0, 1fr) auto 64px auto 48px';
const ZONE_KEY = {
  [SKY_ZONE.FIX_FIRST]: 'overview.riskZoneFixFirst', [SKY_ZONE.WATCH]: 'overview.riskZoneWatch', [SKY_ZONE.HEALTHY]: 'overview.riskZoneHealthy',
};
const KIND_KEY = { [AREA_KIND.HOTSPOT]: 'map.riskKindHotspot', [AREA_KIND.DORMANT]: 'map.riskKindDormant' };
const NO_DIMENSIONS = [];

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

function AreaRow({ area, onClick }) {
  return (
    <GridRow onClick={onClick ? () => onClick(area) : undefined}>
      <GridCell>
        <div className="offending-file-cell">
          <span className="offending-file-name">{area.name}</span>
          <span className="offending-file-path">{areaSub(area)}</span>
        </div>
      </GridCell>
      <GridCell><span className={`risk-zone-chip risk-zone-chip--${area.zone}`}>{t(ZONE_KEY[area.zone])}</span></GridCell>
      <GridCell numeric>{t('overview.riskDensity', { density: area.density.toFixed(DENSITY_DECIMALS) })}</GridCell>
      <SeverityAndFilesCells sev={area.severities} fileCount={area.files} />
    </GridRow>
  );
}

/**
 * @param {object} props
 * @param {string} props.project
 * @param {string} props.source a PROJECT_SOURCE value
 * @param {string[]} [props.dimensions] measure the areas over these dimensions only (none: every finding)
 * @param {(area: {name: string}) => void} [props.onAreaClick]
 * @param {() => void} [props.onOpenRisk]
 */
export default function RiskAreasPanel({ project, source, dimensions = NO_DIMENSIONS, onAreaClick, onOpenRisk }) {
  const { areas, loading, unavailable } = useRiskAreas({ project, source, dimensions });
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
        <GridTable columns={AREA_COLUMNS} dense>
          {rows.slice(0, AREAS_SHOWN).map((area) => <AreaRow key={area.name} area={area} onClick={onAreaClick} />)}
        </GridTable>
      ) : <div className="risk-areas-panel__none">{t('overview.riskAreasNone')}</div>}
      <div className="panel-foot">
        <span>{t('overview.riskAreasFoot', { areas: total.toLocaleString(LOCALE), fixFirst, watch })}</span>
        {onOpenRisk && <button type="button" className="panel-foot__link" onClick={onOpenRisk}>{t('overview.riskAreasOpen')}</button>}
      </div>
    </section>
  );
}
