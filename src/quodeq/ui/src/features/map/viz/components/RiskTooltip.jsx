import { riskAreaInfo } from './riskAreaInfo.js';

const TOOLTIP_ROWS = 3;

/** Tooltip of the hovered area, docked in the map's corner (as the Circle Pack's). */
export default function RiskTooltip({ area }) {
  if (!area) return null;
  const info = riskAreaInfo(area);
  return (
    <div className="map-tooltip map-tooltip--docked">
      <div className="map-tooltip-title">{info.title}</div>
      {info.tag && <div className="map-tooltip-tag">{info.tag}</div>}
      {info.lines.slice(0, TOOLTIP_ROWS).map((l) => <div key={l.label} className="map-tooltip-row"><span>{l.label}</span><span>{l.value}</span></div>)}
    </div>
  );
}
