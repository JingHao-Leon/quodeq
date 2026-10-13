import { t } from '../../../../strings/index.js';
import { AREA_KIND } from '../../mapVocab.js';

const KIND_ROWS = [
  { kind: AREA_KIND.HOTSPOT, key: 'map.riskLegendHotspot', className: 'risk-ring risk-ring--solid' },
  { kind: AREA_KIND.DORMANT, key: 'map.riskLegendDormant', className: 'risk-ring risk-ring--dashed' },
];

/** Risk legend: the need bar (healthy at the rim, fix first in the middle) and the kinds present. */
export default function RiskLegend({ kinds }) {
  return (
    <div className="pack-legend risk-legend">
      <div className="pack-legend-title">{t('map.riskLegendTitle')}</div>
      <div className="risk-legend-bar" aria-hidden="true" />
      <div className="risk-legend-scale">
        <span>{t('map.riskLegendHealthy')}</span>
        <span>{t('map.riskLegendWatch')}</span>
        <span className="risk-legend-hot">{t('map.riskLegendFixFirst')}</span>
      </div>
      {KIND_ROWS.filter((r) => kinds.includes(r.kind)).map((r) => (
        <div key={r.kind} className="pack-legend-row"><span className={r.className} aria-hidden="true" />{t(r.key)}</div>
      ))}
      <div className="pack-legend-note">{t('map.riskLegendDots')}</div>
    </div>
  );
}
