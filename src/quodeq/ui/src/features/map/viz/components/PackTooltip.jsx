import { t } from '../../../../strings/index.js';
import { PERCENT } from '../../../../constants.js';
import MapTooltipSeverityRows from './MapTooltipSeverityRows.jsx';
import { clampTooltipToElement } from '../core/tooltipPlacement.js';

/** A folder's or file's findings: violations (with per-severity rows when there are any), compliance and rate. */
function FindingCounts({ counts }) {
  const total = counts.violations + counts.compliance;
  return (
    <>
      <div className="map-tooltip-row"><span>{t('map.violations')}</span><span>{counts.violations}</span></div>
      {counts.violations > 0 && <MapTooltipSeverityRows severity={counts.severity} />}
      <div className="map-tooltip-row"><span>{t('map.compliance')}</span><span>{counts.compliance}</span></div>
      <div className="map-tooltip-row"><span>{t('map.rate')}</span><span>{total > 0 ? ((counts.compliance / total) * PERCENT).toFixed(0) + '%' : t('map.rateNone')}</span></div>
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
  const circle = node.data;
  const style = clampTooltipToElement(mousePos.current.x, mousePos.current.y, containerRef.current);
  return (
    <div className="map-tooltip map-tooltip--floating" style={style}>
      <div className="map-tooltip-title">{(circle.path || circle.name || '').replace(/\/$/, '')}</div>
      {note ? <div className="map-tooltip-row"><span>{note}</span></div> : <FindingCounts counts={circle} />}
    </div>
  );
}
