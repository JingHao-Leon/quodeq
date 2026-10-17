import { riskAreaInfo, riskTooltipLines } from './riskAreaInfo.js';
import MapTooltipSeverityRows from './MapTooltipSeverityRows.jsx';
import { t } from '../../../../strings/index.js';

const Row = ({ label, value }) => <div className="map-tooltip-row"><span>{label}</span><span>{value}</span></div>;

/**
 * Tooltip of the hovered area, docked in the map's corner (as the Circle Pack's): its name and layers,
 * its weighted issues per file, kind and issues, the issues by severity, and its files.
 */
export default function RiskTooltip({ area }) {
  if (!area) return null;
  const info = riskAreaInfo(area);
  const s = area.stats;
  return (
    <div className="map-tooltip map-tooltip--docked">
      <div className="map-tooltip-title">{info.title}</div>
      {info.tag && <div className="map-tooltip-tag">{info.tag}</div>}
      {riskTooltipLines(area).map((l) => <Row key={l.label} label={l.label} value={l.value} />)}
      <MapTooltipSeverityRows severity={{ critical: s.critical, major: s.major, minor: s.violations - s.critical - s.major }} />
      <Row label={t('map.riskFiles')} value={s.files} />
    </div>
  );
}
