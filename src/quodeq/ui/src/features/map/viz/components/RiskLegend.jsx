import { t } from '../../../../strings/index.js';
import { AREA_KIND } from '../../mapVocab.js';
import { FIX_FIRST_DENSITY, WATCH_DENSITY } from '../core/skyScale.js';

const KIND_ROWS = [
  { kind: AREA_KIND.HOTSPOT, key: 'map.riskLegendHotspot', className: 'risk-ring risk-ring--solid' },
  { kind: AREA_KIND.DORMANT, key: 'map.riskLegendDormant', className: 'risk-ring risk-ring--dashed' },
];

/**
 * Risk legend, what the sky draws: the two zones (closer to the centre needs
 * more rework) with their thresholds, the colour of bubbles and dots (issues
 * against the project's average, as on the Circle Pack), the size, and the
 * kind rings present.
 */
export default function RiskLegend({ kinds }) {
  return (
    <div className="pack-legend risk-legend">
      <div className="pack-legend-title">{t('map.riskLegendTitle')}</div>
      <div className="pack-legend-row"><span className="risk-zone risk-zone--fix" aria-hidden="true" />{t('map.riskLegendFixFirstZone', { n: FIX_FIRST_DENSITY })}</div>
      <div className="pack-legend-row"><span className="risk-zone risk-zone--watch" aria-hidden="true" />{t('map.riskLegendWatchZone', { from: WATCH_DENSITY, to: FIX_FIRST_DENSITY })}</div>
      <div className="pack-legend-row">
        <span>{t('map.legendBetter')}</span>
        <span className="pack-legend-bar" aria-hidden="true" />
        <span>{t('map.legendWorse')}</span>
      </div>
      <div className="pack-legend-note">{t('map.riskLegendColour')}</div>
      <div className="pack-legend-note">{t('map.riskLegendSize')}</div>
      {KIND_ROWS.filter((r) => kinds.includes(r.kind)).map((r) => (
        <div key={r.kind} className="pack-legend-row"><span className={r.className} aria-hidden="true" />{t(r.key)}</div>
      ))}
    </div>
  );
}
