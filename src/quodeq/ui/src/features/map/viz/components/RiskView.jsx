import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SkyCanvas from './SkyCanvas.jsx';
import RiskLegend from './RiskLegend.jsx';
import RiskTooltip from './RiskTooltip.jsx';
import { WRAPPER_STYLE } from './canvasLayer.js';
import { LevelInfoPanel } from './galaxyViewInfo.jsx';
import { riskAreaInfo, riskLabelText } from './riskAreaInfo.js';
import { skyAreas } from '../core/skyLayout.js';
import { t } from '../../../../strings/index.js';

function stateMessage({ areaState, bubbles }) {
  if (areaState.unavailable) return t('map.activityUnavailable');
  if (areaState.loading) return t('map.riskLoading');
  if (areaState.failed) return t('map.riskFailed');
  return bubbles.length ? null : t('map.riskEmpty');
}

/**
 * Selection (by area name, kept by the Risk tab so the time-lapse follows
 * it) plus keyboard focus: an area chosen from the keyboard list sends focus
 * to the panel's View Details button; Escape there clears the selection and
 * hands focus back to the sky canvas.
 */
function useRiskSelection(bubbles, { selectedName, onSelectName }) {
  const [focusRequest, setFocusRequest] = useState(0);
  const skyRef = useRef(null);
  const detailRef = useRef(null);
  useEffect(() => { if (focusRequest) detailRef.current?.focus(); }, [focusRequest]);
  const index = selectedName === null ? -1 : bubbles.findIndex((a) => a.name === selectedName);
  const onSelect = useCallback((i, byKeyboard) => {
    onSelectName(i === null ? null : bubbles[i].name);
    if (byKeyboard && i !== null) setFocusRequest((n) => n + 1);
  }, [bubbles, onSelectName]);
  const onEscape = useCallback(() => { onSelectName(null); skyRef.current?.focus(); }, [onSelectName]);
  return { selected: index < 0 ? null : index, onSelect, onEscape, skyRef, detailRef };
}

/** The Risk tab: functional areas on a sky, closer to the centre needs rework first. */
export default function RiskView({ areaState, dark, showLabels, resetKey, onViewDetails, selection }) {
  const bubbles = useMemo(() => skyAreas(areaState.areaSet), [areaState.areaSet]);
  const { selected, onSelect, onEscape, skyRef, detailRef } = useRiskSelection(bubbles, selection);
  const [hover, setHover] = useState(null);
  useEffect(() => { setHover(null); }, [resetKey, bubbles]);
  const message = stateMessage({ areaState, bubbles });
  if (message) return <div className="map-empty-note" role="status">{message}</div>;
  const chosen = selected === null ? null : bubbles[selected];
  const panel = chosen && {
    ...riskAreaInfo(chosen),
    detailAction: () => onViewDetails(chosen),
  };
  const kinds = [...new Set(bubbles.map((a) => a.kind))];
  return (
    <div style={WRAPPER_STYLE}>
      <SkyCanvas areas={bubbles} average={areaState.areaSet.average} dark={dark} showLabels={showLabels}
        selected={selected} onSelect={onSelect} onHover={setHover} labelText={riskLabelText} canvasRef={skyRef} />
      <RiskTooltip area={hover && bubbles[hover.index]} />
      <LevelInfoPanel levelInfo={panel} label={chosen ? t('map.riskPanelAria', { name: chosen.name }) : undefined}
        detailRef={detailRef} onEscape={onEscape} />
      <RiskLegend kinds={kinds} />
    </div>
  );
}
