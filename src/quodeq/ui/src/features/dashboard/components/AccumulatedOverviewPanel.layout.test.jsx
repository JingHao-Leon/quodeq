import { formatRunWhen } from '../../../utils/dateFormatting.js';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AccumulatedOverviewPanel from './AccumulatedOverviewPanel.jsx';
import { SidePaneProvider } from '../../side-pane/SidePaneProvider.jsx';

// The areas table and the header read through react-query; this test is about the Overview's layout and order.
vi.mock('../../map/components/RiskAreasPanel.jsx', () => ({ default: () => <div>areas table</div> }));
vi.mock('./OverviewHead.jsx', () => ({ default: ({ pastRun }) => (pastRun ? <p>past {pastRun.when}</p> : null) }));
vi.mock('../hooks/useOverviewPeriod.js', () => ({
  usePreviousPeriodMetrics: () => null,
  useOverviewSince: () => ({ newCount: 3, resolvedCount: 1, typesOpened: 0, typesClosed: 0 }),
  useRunModel: () => null,
}));

const run = (runId, day, scores) => ({
  runId, dateISO: `${day}T10:00:00`, dateLabel: day, numericAverage: 7, overallGrade: 'B',
  dimensions: Object.keys(scores), dimensionDetails: Object.entries(scores).map(([dimension, score]) => ({ dimension, score })),
});
const TREND = [run('r2', '2026-10-14', { security: 6, reliability: 8.5 }), run('r1', '2026-10-13', { security: 7, reliability: 8.5 })];
const DIMS = [
  { dimension: 'reliability', overallScore: '8.5/10', fromRunId: 'r2' },
  { dimension: 'security', overallScore: '6.0/10', fromRunId: 'r2' },
];

function renderPanel(extra = {}) {
  const onDimensionClick = vi.fn();
  const data = {
    accumulated: { summary: { numericAverage: 7 }, dimensions: DIMS }, accumulatedDimensions: DIMS,
    availableRuns: [{ runId: 'r2', status: 'done', dateISO: '2026-10-14T10:00:00' }, { runId: 'r1', status: 'done', dateISO: '2026-10-13T10:00:00' }],
    dailyRuns: null, overviewRunIndex: 0, trend: TREND, selectedRunId: null, granularity: 'day',
    projectInfo: null, selectedProject: 'p', selectedSource: 'local', ...extra,
  };
  render(<SidePaneProvider><AccumulatedOverviewPanel data={data} callbacks={{ onDimensionClick, onRunClick: vi.fn(), onNavigate: vi.fn() }} /></SidePaneProvider>);
  return onDimensionClick;
}

describe('AccumulatedOverviewPanel layout', () => {
  it('puts the weakest dimension first', () => {
    renderPanel();
    const evaluated = [...document.querySelectorAll('.quality-dimensions .dim-gauge-card:not(.dim-gauge-card--not-evaluated)')];
    expect(evaluated.map((el) => el.querySelector('.dim-gauge-card__name').textContent)).toEqual(['security', 'reliability']);
    expect(evaluated.every((el) => el.classList.contains('dim-gauge-card--compact'))).toBe(true);
  });

  it('reads the since line for the chart\'s period, a mover opening its dimension', () => {
    const onDimensionClick = renderPanel();
    const since = screen.getByRole('region', { name: 'since the previous day' });
    expect(since).toHaveTextContent('3 new');
    fireEvent.click(within(since).getByRole('button', { name: /^security/ }));
    expect(onDimensionClick).toHaveBeenCalledWith(expect.objectContaining({ dimension: 'security' }));
  });

  it('shows the dimensions radial beside the history, and the areas first in the Where panel', () => {
    renderPanel();
    expect(screen.getByRole('region', { name: 'Dimensions radial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'areas' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('areas table')).toBeInTheDocument();
  });

  it('hands the header the past-run note when an older run is picked', () => {
    renderPanel({ selectedRunId: 'r1' });
    expect(screen.getByText(`past ${formatRunWhen('2026-10-13T10:00:00')}`)).toBeInTheDocument();
  });
});
