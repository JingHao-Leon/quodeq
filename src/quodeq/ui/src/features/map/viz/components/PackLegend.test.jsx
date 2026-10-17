import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PackLegend from './PackLegend.jsx';
import { t } from '../../../../strings/index.js';

describe('PackLegend', () => {
  it('concentration: better to worse, the severity cap and the size rule', () => {
    render(<PackLegend mode="concentration" activitySource="git" activityLoading={false} />);
    expect(screen.getByText(t('map.legendBetter'))).toBeInTheDocument();
    expect(screen.getByText(t('map.legendWorse'))).toBeInTheDocument();
    expect(screen.getByText(t('map.legendCapped'))).toBeInTheDocument();
    expect(screen.getByText(t('map.legendSize'))).toBeInTheDocument();
  });

  it('activity from an estimate says so', () => {
    render(<PackLegend mode="activity" activitySource="estimated" activityLoading={false} />);
    expect(screen.getByText(t('map.legendActivityEstimated'))).toBeInTheDocument();
  });

  it('activity while the history loads says so', () => {
    render(<PackLegend mode="activity" activitySource="none" activityLoading />);
    expect(screen.getByText(t('map.legendActivityLoading'))).toBeInTheDocument();
  });
});
