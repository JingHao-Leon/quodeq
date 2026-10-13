import { render, screen } from '@testing-library/react';
import RiskLegend from './RiskLegend.jsx';
import { t } from '../../../../strings/index.js';
import { AREA_KIND } from '../../mapVocab.js';

describe('RiskLegend', () => {
  it('the need bar, and only the kinds present', () => {
    render(<RiskLegend kinds={[AREA_KIND.HOTSPOT, AREA_KIND.WATCH]} />);
    expect(screen.getByText(t('map.riskLegendFixFirst'))).toBeInTheDocument();
    expect(screen.getByText(t('map.riskLegendHotspot'))).toBeInTheDocument();
    expect(screen.queryByText(t('map.riskLegendDormant'))).toBeNull();
  });
});
