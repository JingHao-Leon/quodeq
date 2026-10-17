import { formatRunWhen } from '../../../utils/dateFormatting.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '../../../strings/index.js';

const data = vi.hoisted(() => ({ d: null, previous: null, info: null, diffs: [] }));

// The page's own-trend query needs a QueryClient; these render it bare.
vi.mock('./useExplorerTrend.js', () => ({ useExplorerTrend: (_p, _s, trend) => trend ?? [] }));
vi.mock('./explorerDataHooks.js', () => ({
  useExplorerData: () => data.d,
  buildEvalPrincipalFn: () => (name) => ({ principle: name }),
}));
vi.mock('../hooks/useStandardDescriptions.js', () => ({
  useStandardDescriptions: () => ({ standardDescription: 'Keeps the core clean', standardInfo: data.info }),
}));
vi.mock('../../../hooks/usePrinciplePeriodDeltas.js', () => ({ usePrinciplePeriodDeltas: () => ({ principles: new Map(), previous: data.previous }) }));
// The since line's run comparisons read through react-query too.
vi.mock('../../../hooks/usePeriodDiffs.js', () => ({ usePeriodDiffs: () => ({ runs: [], payloads: data.diffs }) }));
// The Map's areas read through react-query as well.
vi.mock('../../map/components/RiskAreasPanel.jsx', () => ({
  default: ({ dimensions, onAreaFindings, onAreaInMap, onOpenRisk }) => (
    <>
      <button type="button" onClick={() => onAreaFindings({ kind: 'area', name: 'api', paths: ['src/api/'], small: false, dimensions })}>
        area row {dimensions.join(',')}
      </button>
      <button type="button" onClick={() => onAreaInMap({ name: 'api' })}>area in map</button>
      <button type="button" onClick={onOpenRisk}>risk in map</button>
    </>
  ),
}));
vi.mock('./useExplorerPageSpecs.jsx', () => ({ useExplorerPageSpecs: () => {} }));
vi.mock('./DimensionScoreHistoryPanel.jsx', () => ({ default: () => <div data-testid="history" /> }));
vi.mock('../../../components/radial/RadialPanel.jsx', () => ({ default: () => <div data-testid="radial" /> }));
vi.mock('./PrinciplesCardsRow.jsx', () => ({
  default: ({ onPrincipleClick }) => <button type="button" onClick={() => onPrincipleClick('Dependency Rule')}>principle card</button>,
}));
vi.mock('../../../components/TopOffendingFilesTable.jsx', () => ({
  default: ({ onFileClick }) => <button type="button" onClick={() => onFileClick({ file: 'src/a.py' })}>file row</button>,
  OffendingFilesHead: () => null,
}));

import ExplorerPage from './ExplorerPage.jsx';

// The header's tiles. Queries stay inside them: the since row may show a random loading tip, and a tip
// can bold the same word as a tile ("On the Map's **Risk** tab"), so a page-wide query would flake.
const headTiles = () => within(document.querySelector('section.findings-head .findings-head__stats'));

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
      topFiles: [{ file: 'src/a.py', total: 2 }], severityCounts: { critical: 1, major: 1 }, totalCompliant: 8,
    };
    data.previous = null;
    data.diffs = [];
    data.info = null;
  });

  it('reads the dimension\'s ring, description and numbers, per 100 over the files it read, no Risk', () => {
    const { container } = page();
    expect(container.querySelector('.findings-head__ring')).toHaveTextContent('7.5');
    expect(container.querySelector('.findings-head__desc')).toHaveTextContent('Keeps the core clean');
    expect(screen.getByText(t('violations.scopeStatFilesRead', { count: 40 }))).toBeInTheDocument();
    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(headTiles().queryByText(t('violations.scopeStatRisk'))).toBeNull();
  });

  it('its own report\'s files read win over the borrowed count', () => {
    data.d.evalData.filesRead = 20;
    page();
    expect(screen.getByText(t('violations.scopeStatFilesRead', { count: 20 }))).toBeInTheDocument();
  });

  it('the tiles and badges open the dimension\'s findings, where the old cards went', () => {
    const onNavigate = vi.fn();
    page({ onNavigate });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('overview.showAllViolationsAria')) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('overview.showComplianceAria')) }));
    fireEvent.click(screen.getByRole('button', { name: 'critical severity' }));
    expect(onNavigate.mock.calls).toEqual([
      scope({ kind: 'dimension', dimension: 'security', filter: null }),
      scope({ kind: 'dimension', dimension: 'security', filter: 'compliance' }),
      scope({ kind: 'dimension', dimension: 'security', filter: 'critical' }),
    ]);
  });

  it('without navigation the tiles open nothing', () => {
    page();
    expect(screen.queryByRole('button', { name: new RegExp(t('overview.showAllViolationsAria')) })).toBeNull();
  });

  it('reads header, principle cards, score history beside the radial, then Fix first beside where the findings are', async () => {
    const { container } = page({ onNavigate: vi.fn() });
    await screen.findByRole('button', { name: 'principle card' });
    const order = [...container.querySelector('.explorer-page').children].map((n) => n.getAttribute('aria-label') || n.className);
    expect(order).toEqual(['findings-head__sticky', t('overview.sinceTipLabel'), 'findings-head qd-cards-panel', t('explorer.principlesAria'), 'qd-top-grid explorer-top-grid', 'explorer-bottom']);
  });

  it('a principle card opens its principle, a file row its file', async () => {
    const onNavigate = vi.fn();
    page({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: 'principle card' }));
    expect(onNavigate).toHaveBeenCalledWith(...scope({ kind: 'principle', dimension: 'security', principle: 'Dependency Rule' }));
    fireEvent.click(screen.getByRole('button', { name: t('explorer.where_files') }));
    fireEvent.click(screen.getByRole('button', { name: 'file row' }));
    expect(onNavigate).toHaveBeenLastCalledWith(...scope({ kind: 'file', path: 'src/a.py' }));
  });

  it('the sub line says what it is, where the standard comes from, its sources by name, then the date', () => {
    data.info = { type: 'iso', subtype: '25010', version: '2023.11', source: 'iso25010, cisq, asvs' };
    const { container } = page({ dateLabel: 'Oct 14' });
    expect(container.querySelector('.findings-head .term-header__sub')).toHaveTextContent('dimension · iso-25010 · v2023.11 · based on ISO 25010, CISQ, ASVS · Oct 14');
  });

  it('reads the since line for this dimension only, in the chart\'s period', () => {
    const counts = (added, fixed) => ({ counts: { new: added, resolved: fixed }, types: { opened: [], closed: [] } });
    data.diffs = [{ dimensions: { security: counts(4, 2), reliability: counts(9, 9) } }];
    page({ granularity: 'week' });
    const since = screen.getByRole('region', { name: 'since the previous week' });
    expect(since).toHaveTextContent('4 new');
    expect(since).toHaveTextContent('2 fixed');
  });

  it('the tiles read their change since the previous period: the pass rate in points, the rates as rates', () => {
    data.previous = { totals: { severity: { major: 1 }, violationCount: 1, complianceCount: 9 }, filesRead: 40 };
    const { container } = page();
    const changes = [...container.querySelectorAll('.findings-head__change .trend-badge-delta')].map((n) => n.textContent);
    expect(changes).toEqual(['-10', '+2.5', '+25.0']);
  });

  it('per 100 on a run that is not the latest reads that run\'s files read, not today\'s', () => {
    data.d.runFilesRead = 20;
    page({ runId: 'r1', scopedFindings: { latestRunId: 'r9' } });
    expect(screen.getByText(t('violations.scopeStatFilesRead', { count: 20 }))).toBeInTheDocument();
  });

  it('a past run says when it ran, in words, and the way back shows the latest again', () => {
    const trend = [{ runId: 'r9', dateLabel: 'Oct 14', dateISO: '2026-10-14T10:00:00' }, { runId: 'r1', dateLabel: 'Oct 1', dateISO: '2026-10-01T10:00:00' }];
    page({ runId: 'r1', dateLabel: 'Oct 1', trend, scopedFindings: { latestRunId: 'r9' } });
    expect(document.querySelector('.findings-head__past-when')).toHaveTextContent(formatRunWhen('2026-10-01T10:00:00'));
    fireEvent.click(screen.getByRole('button', { name: t('violations.headBackToLatest') }));
    expect(document.querySelector('.findings-head__past')).toBeNull();
  });

  it('a Fix first row opens its requirement, a folder the list on that folder and this dimension', async () => {
    data.d.allViolations = [{ severity: 'major', req: 'SEC-1', title: 'Validate input', principle: 'Dependency Rule', file: 'src/api/a.py', line: 3 }];
    const onNavigate = vi.fn();
    page({ onNavigate });
    fireEvent.click(await screen.findByText('Validate input'));
    expect(onNavigate).toHaveBeenLastCalledWith(...scope({ kind: 'requirement', dimension: 'security', req: 'SEC-1', text: 'Validate input' }));
    fireEvent.click(screen.getByRole('button', { name: t('explorer.where_folders') }));
    fireEvent.click(screen.getByTitle('src/api'));
    expect(onNavigate).toHaveBeenLastCalledWith('violations', { wb: { paths: ['src/api/'], dimension: 'security', selectedId: null }, asOf: null });
  });

  it('where the findings are: the areas first, folders and files one switch away', () => {
    const { container } = page();
    const pressed = () => [...container.querySelectorAll('.explorer-where__switch .term-btn')].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed()).toEqual(['true', 'false', 'false']);
    expect(screen.getByRole('button', { name: 'area row security' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('explorer.where_files') }));
    expect(pressed()).toEqual(['false', 'false', 'true']);
    expect(screen.getByRole('button', { name: 'file row' })).toBeInTheDocument();
  });

  it('an area opens its findings over this dimension; its map icon the Risk tab filtered to it with the area selected; the foot, the filtered sky', () => {
    const onNavigate = vi.fn();
    page({ onNavigate });
    fireEvent.click(screen.getByRole('button', { name: 'area row security' }));
    expect(onNavigate).toHaveBeenLastCalledWith('violations', {
      scope: { kind: 'area', name: 'api', paths: ['src/api/'], small: false, dimensions: ['security'] }, asOf: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'area in map' }));
    expect(onNavigate).toHaveBeenLastCalledWith('map', { vizStyle: 'risk', dimensions: ['security'], area: 'api' });
    fireEvent.click(screen.getByRole('button', { name: 'risk in map' }));
    expect(onNavigate).toHaveBeenLastCalledWith('map', { vizStyle: 'risk', dimensions: ['security'] });
  });
});
