import { useEffect, useMemo, useRef, useState } from 'react';
import SkyCanvas from './SkyCanvas.jsx';
import RiskLegend from './RiskLegend.jsx';
import { LevelInfoPanel } from './galaxyViewInfo.jsx';
import { riskAreaInfo, riskLabelText } from './riskAreaInfo.js';
import { SKY_MIN_FILES } from '../core/skyLayout.js';
import { t } from '../../../../strings/index.js';

const CONTAINER_STYLE = { position: 'relative', width: '100%', height: '100%' };
const TOOLTIP_OFFSET = 16;
const TOOLTIP_MAX_MARGIN = 180;
const TOOLTIP_MAX_MARGIN_Y = 160;
const CONTAINER_FALLBACK_PX = 300;
const TOOLTIP_ROWS = 3;

function stateMessage({ areaState, bubbles }) {
  if (areaState.unavailable) return t('map.activityUnavailable');
  if (areaState.loading) return t('map.riskLoading');
  if (areaState.failed) return t('map.riskFailed');
  return bubbles.length ? null : t('map.riskEmpty');
}

/** Tooltip position, kept inside the container the way the pack tooltip is. */
function tooltipPosition(at, el) {
  return {
    left: Math.min(at.x + TOOLTIP_OFFSET, (el?.offsetWidth || CONTAINER_FALLBACK_PX) - TOOLTIP_MAX_MARGIN),
    top: Math.min(at.y + TOOLTIP_OFFSET, (el?.offsetHeight || CONTAINER_FALLBACK_PX) - TOOLTIP_MAX_MARGIN_Y),
  };
}

function RiskTooltip({ area, at, container }) {
  if (!area || !at) return null;
  const info = riskAreaInfo(area);
  return (
    <div className="map-tooltip map-tooltip--floating" style={tooltipPosition(at, container)}>
      <div className="map-tooltip-title">{info.title}</div>
      {info.tag && <div className="map-tooltip-tag">{info.tag}</div>}
      {info.lines.slice(0, TOOLTIP_ROWS).map((l) => (
        <div key={l.label} className="map-tooltip-row"><span>{l.label}</span><span>{l.value}</span></div>
      ))}
    </div>
  );
}

/** The Risk tab: functional areas on a sky, closer to the centre needs rework first. */
export default function RiskView({ areaState, dark, showLabels, resetKey, onViewDetails, onShowInPack }) {
  const bubbles = useMemo(() => areaState.areaSet.areas.filter((a) => a.stats.files >= SKY_MIN_FILES), [areaState.areaSet]);
  const containerRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  useEffect(() => { setSelected(null); setHover(null); }, [resetKey, bubbles]);
  const message = stateMessage({ areaState, bubbles });
  if (message) return <div className="map-empty-note" role="status">{message}</div>;
  const chosen = selected === null ? null : bubbles[selected];
  const panel = chosen && {
    ...riskAreaInfo(chosen),
    detailAction: () => onViewDetails(chosen),
    secondaryAction: { label: t('map.riskShowInPack'), onClick: () => onShowInPack(chosen) },
  };
  const kinds = [...new Set(bubbles.map((a) => a.kind))];
  return (
    <div ref={containerRef} style={CONTAINER_STYLE}>
      <SkyCanvas areas={bubbles} average={areaState.areaSet.average} dark={dark} showLabels={showLabels}
        selected={selected} onSelect={setSelected} onHover={setHover} labelText={riskLabelText} />
      <RiskTooltip area={hover && bubbles[hover.index]} at={hover} container={containerRef.current} />
      <LevelInfoPanel levelInfo={panel} />
      <RiskLegend kinds={kinds} />
    </div>
  );
}
