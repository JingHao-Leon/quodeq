import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '../../../strings/index.js';

const data = vi.hoisted(() => ({ d: null }));

// The page's own-trend query needs a QueryClient; these render it bare.
vi.mock('./useExplorerTrend.js', () => ({ useExplorerTrend: (_p, _s, trend) => trend ?? [] }));
vi.mock('./explorerDataHooks.js', () => ({
  useExplorerData: () => data.d,
  buildEvalPrincipalFn: () => (name) => ({ principle: name }),
}));
vi.mock('../hooks/useStandardDescriptions.js', () => ({ useStandardDescriptions: () => ({ standardDescription: 'Keeps the core clean' }) }));
vi.mock('./useExplorerPageSpecs.jsx', () => ({ useExplorerPageSpecs: () => {} }));
vi.mock('./DimensionScoreHistoryPanel.jsx', () => ({ default: () => <div data-testid="history" /> }));
vi.mock('./ExplorerRadialPanel.jsx', () => ({ default: () => <div data-testid="radial" /> }));
vi.mock('./PrinciplesCardsRow.jsx', () => ({
  default: ({ onPrincipleClick }) => <button type="button" onClick={() => onPrincipleClick('Dependency Rule')}>principle card</button>,
}));
vi.mock('../../dashboard/components/TopOffendingFilesTable.jsx', () => ({
  default: ({ onFileClick }) => <button type="button" onClick={() => onFileClick({ file: 'src/a.py' })}>file row</button>,
  OffendingFilesHead: () => null,
}));

import ExplorerPage from './ExplorerPage.jsx';

const scope = (s) => ['violations', { scope: s, asOf: null }];
const page = (props = {}) => render(
  <ExplorerPage project="demo" dimension="security" granularity="day" scopedFindings={{ latestRunId: null }} filesRead={40} {...props} />,
);

describe('ExplorerPage header', () => {
  beforeEach(() => {
    data.d = {
      loading: false, error: null, waiting: false, isFetching: false,
      evalData: { dimension: 'security', principleGrades: [] },
      overallGrade: { score: '7.5', grade: 'good' },
      principleGrades: [{ principle: 'Dependency Rule', score: '7.5', grade: 'B' }],
      allViolations: [{ severity: 'critical' }, { severity: 'major' }],
      complianceByPrinciple: new Map([['Dependency Rule', [{ file: 'a.py' }]]]),
      topFiles: [], severityCounts: { critical: 1, major: 1 }, totalCompliant: 8,
    };
  });

  it('reads the dimension\'s ring, description and numbers, per 100 over the files it read, no Risk', () => {
    const { container } = page();
    expect(container.querySelector('.findings-head__ring')).toHaveTextContent('7.5');
    expect(container.querySelector('.findings-head__desc')).toHaveTextContent('Keeps the core clean');
    expect(screen.getByText(t('violations.scopeStatFilesRead', { count: 40 }))).toBeInTheDocument();
    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.queryByText(t('violations.scopeStatRisk'))).toBeNull();
  });

  it('its own report\'s files read win over the borrowed count', () => {
    data.d.evalData.filesRead = 20;
    page();
    expect(screen.getByText(t('violations.scopeStatFilesRead', { count: 20 }))).toBeInTheDocument();
  });

  it('the tiles and badges open the dimension\'s findings, where the old cards went', () => {
    const onNavigate = vi.fn();
    page({ onNavigate });
    fireEvent.click(screen.getByRole('button', { name: t('overview.showAllViolationsAria') }));
    fireEvent.click(screen.getByRole('button', { name: t('overview.showComplianceAria') }));
    fireEvent.click(screen.getByRole('button', { name: 'critical severity' }));
    expect(onNavigate.mock.calls).toEqual([
      scope({ kind: 'dimension', dimension: 'security', filter: null }),
      scope({ kind: 'dimension', dimension: 'security', filter: 'compliance' }),
      scope({ kind: 'dimension', dimension: 'security', filter: 'critical' }),
    ]);
  });

  it('without navigation the tiles open nothing', () => {
    page();
    expect(screen.queryByRole('button', { name: t('overview.showAllViolationsAria') })).toBeNull();
  });

  it('reads header, principle cards, score history beside the radial, then the files', async () => {
    const onNavigate = vi.fn();
    const { container } = page({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: 'principle card' }));
    expect(onNavigate).toHaveBeenCalledWith(...scope({ kind: 'principle', dimension: 'security', principle: 'Dependency Rule' }));
    const order = [...container.querySelector('.explorer-page').children].map((n) => n.getAttribute('aria-label') || n.className);
    expect(order).toEqual(['findings-head qd-cards-panel', t('explorer.principlesAria'), 'qd-top-grid explorer-top-grid', t('overview.violationsByFileAria')]);
    fireEvent.click(screen.getByRole('button', { name: 'file row' }));
    expect(onNavigate).toHaveBeenLastCalledWith(...scope({ kind: 'file', path: 'src/a.py' }));
  });
});
