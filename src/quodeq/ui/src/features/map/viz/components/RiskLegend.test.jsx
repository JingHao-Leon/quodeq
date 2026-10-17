import { render, screen } from '@testing-library/react';
import RiskLegend from './RiskLegend.jsx';
import { t } from '../../../../strings/index.js';
import { AREA_KIND } from '../../mapVocab.js';
import { FIX_FIRST_DENSITY, WATCH_DENSITY } from '../core/skyScale.js';

describe('RiskLegend', () => {
  it('the two zones with the thresholds the sky uses', () => {
    const { container } = render(<RiskLegend kinds={[]} />);
    expect(screen.getByText(t('map.riskLegendFixFirstZone', { n: FIX_FIRST_DENSITY }))).toBeInTheDocument();
    expect(screen.getByText(t('map.riskLegendWatchZone', { from: WATCH_DENSITY, to: FIX_FIRST_DENSITY }))).toBeInTheDocument();
    expect(container.querySelectorAll('.risk-zone--fix, .risk-zone--watch')).toHaveLength(2);
  });

  it('the colour scale from better to worse, what the colour means, and what the size is', () => {
    const { container } = render(<RiskLegend kinds={[]} />);
    expect(container.querySelector('.pack-legend-bar')).not.toBeNull();
    expect(screen.getByText(t('map.legendBetter'))).toBeInTheDocument();
    expect(screen.getByText(t('map.riskLegendColour'))).toBeInTheDocument();
    expect(screen.getByText(t('map.riskLegendSize'))).toBeInTheDocument();
  });

  it('only the kinds present get a ring row', () => {
    render(<RiskLegend kinds={[AREA_KIND.HOTSPOT, AREA_KIND.WATCH]} />);
    expect(screen.getByText(t('map.riskLegendHotspot'))).toBeInTheDocument();
    expect(screen.queryByText(t('map.riskLegendDormant'))).toBeNull();
  });
});
