import { t } from '../../../../strings/index.js';
import { PERCENT } from '../../../../constants.js';
import MapTooltipSeverityRows from './MapTooltipSeverityRows.jsx';
import { clampTooltipToBox } from '../core/tooltipPlacement.js';

/** Tooltip position, clamped so it never runs off the container edge. */
function tooltipStyle(mousePos, containerRef) {
  const el = containerRef.current;
  return clampTooltipToBox(mousePos.current.x, mousePos.current.y, el?.offsetWidth, el?.offsetHeight);
}

/** Violations (with per-severity rows when there are any), compliance and rate. */
function Numbers({ hd }) {
  const total = hd.violations + hd.compliance;
  return (
    <>
      <div className="map-tooltip-row"><span>{t('map.violations')}</span><span>{hd.violations}</span></div>
      {hd.violations > 0 && <MapTooltipSeverityRows severity={hd.severity} />}
      <div className="map-tooltip-row"><span>{t('map.compliance')}</span><span>{hd.compliance}</span></div>
      <div className="map-tooltip-row"><span>{t('map.rate')}</span><span>{total > 0 ? ((hd.compliance / total) * PERCENT).toFixed(0) + '%' : '—'}</span></div>
    </>
  );
}

/**
 * Tooltip of the picked pack circle (`node` is `{depth, data}`). With a
 * `note` (time-lapse: the circle is absent from the run shown) the note
 * replaces the numbers.
 */
export default function PackTooltip({ node, note = null, mousePos, containerRef }) {
  if (!node || node.depth === 0) return null;
  const hd = node.data;
  return (
    <div className="map-tooltip map-tooltip--floating" style={tooltipStyle(mousePos, containerRef)}>
      <div className="map-tooltip-title">{(hd.path || hd.name || '').replace(/\/$/, '')}</div>
      {note ? <div className="map-tooltip-row"><span>{note}</span></div> : <Numbers hd={hd} />}
    </div>
  );
}
