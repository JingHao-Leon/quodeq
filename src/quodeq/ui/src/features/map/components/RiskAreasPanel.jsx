/**
 * RiskAreasPanel: the functional areas that need rework most, as the Map's
 * Risk tab places them: by weighted issues per file, fix first then watch.
 * A row opens the Risk tab with that area selected; the foot counts both
 * zones and links to the whole sky. A project with nothing in either zone
 * says so in one line.
 */
import { useMemo } from 'react';
import { GridTable, GridRow, GridCell, SectionLabel } from '../../../components/terminal/index.js';
import { t, LOCALE } from '../../../strings/index.js';
import useMapAreas from '../hooks/useMapAreas.js';
import { areasNeedingRework } from '../model/areasNeedingRework.js';
import { SKY_ZONE, AREA_KIND } from '../mapVocab.js';
import { SeverityAndFilesCells } from '../../../components/SeverityBadges.jsx';

// Two-line rows, as many as the folders panel shows.
export const AREAS_SHOWN = 5;
const DENSITY_DECIMALS = 2;
/** Name, zone chip, density, severities, files. */
const AREA_COLUMNS = 'minmax(0, 1fr) auto 64px auto 48px';
const ZONE_KEY = { [SKY_ZONE.FIX_FIRST]: 'overview.riskZoneFixFirst', [SKY_ZONE.WATCH]: 'overview.riskZoneWatch' };
const KIND_KEY = { [AREA_KIND.HOTSPOT]: 'map.riskKindHotspot', [AREA_KIND.DORMANT]: 'map.riskKindDormant' };

function sevOf(stats) {
  return { critical: stats.critical, major: stats.major, minor: Math.max(0, stats.violations - stats.critical - stats.major) };
}

function AreaRow({ row, onClick }) {
  const { area, zone } = row;
  const kind = KIND_KEY[area.kind] ? t(KIND_KEY[area.kind]) : null;
  return (
    <GridRow onClick={onClick ? () => onClick(area) : undefined}>
      <GridCell>
        <div className="offending-file-cell">
          <span className="offending-file-name">{area.name}</span>
          <span className="offending-file-path">{kind ? t('overview.riskAreaSubKind', { kind, files: area.stats.files }) : t('overview.riskAreaSub', { files: area.stats.files })}</span>
        </div>
      </GridCell>
      <GridCell><span className={`risk-zone-chip risk-zone-chip--${zone}`}>{t(ZONE_KEY[zone])}</span></GridCell>
      <GridCell numeric>{t('overview.riskDensity', { density: (area.density || 0).toFixed(DENSITY_DECIMALS) })}</GridCell>
      <SeverityAndFilesCells sev={sevOf(area.stats)} fileCount={area.stats.files} />
    </GridRow>
  );
}

export default function RiskAreasPanel({ project, source, onAreaClick, onOpenRisk }) {
  const { areaSet, loading, unavailable } = useMapAreas(project, source, true);
  const { rows, total } = useMemo(() => areasNeedingRework(areaSet), [areaSet]);
  if (unavailable || loading || !areaSet.areas.length) return null;
  const fixFirst = rows.filter((r) => r.zone === SKY_ZONE.FIX_FIRST).length;
  return (
    <section className="qd-cards-panel risk-areas-panel" aria-label={t('overview.riskAreasAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('overview.riskAreasLabel')}</SectionLabel>
        <span className="run-history-panel__stats">{t('overview.riskAreasNote')}</span>
      </div>
      {rows.length ? (
        <GridTable columns={AREA_COLUMNS} dense>
          {rows.slice(0, AREAS_SHOWN).map((r) => <AreaRow key={r.area.name} row={r} onClick={onAreaClick} />)}
        </GridTable>
      ) : <div className="risk-areas-panel__none">{t('overview.riskAreasNone')}</div>}
      <div className="panel-foot">
        <span>{t('overview.riskAreasFoot', {
          areas: total.toLocaleString(LOCALE), fixFirst, watch: rows.length - fixFirst,
        })}</span>
        {onOpenRisk && <button type="button" className="panel-foot__link" onClick={onOpenRisk}>{t('overview.riskAreasOpen')}</button>}
      </div>
    </section>
  );
}
