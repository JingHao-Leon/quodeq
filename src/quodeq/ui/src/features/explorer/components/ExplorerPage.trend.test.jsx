import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const data = vi.hoisted(() => ({ d: null }));

// The page's own-trend query needs a QueryClient; these render it bare.
vi.mock('./useExplorerTrend.js', () => ({ useExplorerTrend: (_p, _s, trend) => trend ?? [] }));
vi.mock('./explorerDataHooks.js', () => ({
  useExplorerData: () => data.d,
  buildEvalPrincipalFn: () => () => ({}),
}));
vi.mock('../hooks/useStandardDescriptions.js', () => ({ useStandardDescriptions: () => ({ standardDescription: '' }) }));
// The previous period's run is a query of its own; these pages have none.
vi.mock('../../../hooks/usePrinciplePeriodDeltas.js', () => ({ usePrinciplePeriodDeltas: () => ({ principles: new Map(), previous: null }) }));
// The since line's run comparisons read through react-query too.
vi.mock('../../../hooks/usePeriodDiffs.js', () => ({ usePeriodDiffs: () => ({ runs: [], payloads: [] }) }));
// The Map's areas read through react-query as well.
vi.mock('../../map/components/RiskAreasPanel.jsx', () => ({ default: () => null }));
vi.mock('./useExplorerPageSpecs.jsx', () => ({ useExplorerPageSpecs: () => {} }));
vi.mock('./DimensionScoreHistoryPanel.jsx', () => ({ default: () => null }));
vi.mock('../../../components/radial/RadialPanel.jsx', () => ({ default: () => null }));
vi.mock('./PrinciplesCardsRow.jsx', () => ({ default: () => null }));
vi.mock('../../../components/TopOffendingFilesTable.jsx', () => ({ default: () => null, OffendingFilesHead: () => null }));

import ExplorerPage from './ExplorerPage.jsx';

// The dimension page's arrows follow the chart's grouping the way the
// Overview's do: the title carries the dimension's change since the
// previous period, the header's severity badges their count changes.
const row = (runId, dateISO, score, critical, majors) => ({
  runId, dateISO, dateLabel: dateISO.slice(0, 10), status: 'completed',
  dimensionDetails: [{ dimension: 'security', score, critical, majors }],
});
const TREND = [
  row('r3', '2026-03-24T10:00:00', 7.5, 2, 5),
  row('r2', '2026-03-18T10:00:00', 7.0, 3, 9),
];

describe('ExplorerPage trend arrows', () => {
  beforeEach(() => {
    data.d = {
      loading: false, error: null, waiting: false, isFetching: false,
      evalData: { dimension: 'security', principleGrades: [] },
      overallGrade: { score: '7.5' },
      principleGrades: [{ principle: 'P1', score: '7.5', grade: 'B' }],
      allViolations: [],
      complianceByPrinciple: new Map([['P1', [{ file: 'a.py' }]]]),
      topFiles: [], severityCounts: {}, totalCompliant: 1,
    };
  });

  it('puts the period delta on the title and the count changes on the severity badges', () => {
    const { container } = render(<ExplorerPage project="demo" dimension="security" granularity="day" trend={TREND} />);
    expect(container.querySelector('.term-header .trend-badge')).toHaveTextContent('+0.5');
    const badges = [...container.querySelectorAll('.findings-head .term-sev-badge')];
    expect(badges.map((b) => parseInt(b.querySelector('.term-sev-badge__delta')?.textContent, 10))).toEqual([-1, -3]);
  });

  it('shows no arrow without a previous period', () => {
    const { container } = render(<ExplorerPage project="demo" dimension="security" granularity="day" trend={TREND.slice(0, 1)} />);
    expect(container.querySelector('.term-header .trend-badge')).toBeNull();
    expect(container.querySelector('.findings-head .term-sev-badge__delta')).toBeNull();
  });
});
