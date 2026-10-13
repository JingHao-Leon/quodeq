import { riskAreaInfo } from './riskAreaInfo.js';

const TOOLTIP_ROWS = 3;

/** Tooltip of the hovered area; with a `note` (time-lapse: no file in the run shown) the note replaces the numbers. */
export default function RiskTooltip({ area, at, note = null }) {
  if (!area || !at) return null;
  const info = riskAreaInfo(area);
  return (
    <div className="map-tooltip map-tooltip--floating" style={at.pos}>
      <div className="map-tooltip-title">{info.title}</div>
      {!note && info.tag && <div className="map-tooltip-tag">{info.tag}</div>}
      {note
        ? <div className="map-tooltip-row"><span>{note}</span></div>
        : info.lines.slice(0, TOOLTIP_ROWS).map((l) => <div key={l.label} className="map-tooltip-row"><span>{l.label}</span><span>{l.value}</span></div>)}
    </div>
  );
}
