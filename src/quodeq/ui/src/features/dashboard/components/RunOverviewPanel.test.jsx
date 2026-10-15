import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RunOverviewPanel from './RunOverviewPanel.jsx';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { formatRunWhen } from '../../../utils/dateFormatting.js';

// The report specs register with the side pane; not this page's business.
vi.mock('./runReportSpecs.jsx', () => ({ useRunReportSpecs: () => {} }));

const RUN_ISO = '2026-10-08T08:23:00';
const BASE_ISO = '2026-10-07T08:00:00';

const dim = (dimension, score, sev, compliance, extra = {}) => ({
  dimension, overallScore: `${score}/10`, overallGrade: 'Good', filesRead: 200, sourceFileCount: 200,
  totals: { severity: sev, violationCount: Object.values(sev).reduce((a, b) => a + b, 0), complianceCount: compliance }, ...extra,
});

const RUN_DIMS = [dim('usability', 9, { minor: 3 }, 97), dim('security', 7, { critical: 1, major: 2 }, 47, { suppressedCount: 12 })];
const BASE_DIMS = [dim('usability', 9, { minor: 3 }, 97), dim('security', 8, { major: 3 }, 47)];

const runEntry = { runId: 'r2', baselineRunId: 'r1', startedAt: RUN_ISO, origin: { kind: 'ci', workflow: 'Quodeq Nightly' },
  model: 'qwen', commit: 'abc1234', activeSeconds: 3600, filesAnalysed: 346 };
const firstEntry = { runId: 'r1', baselineRunId: null, startedAt: BASE_ISO, model: 'qwen', commit: 'def5678' };

const DIFF = { dimensions: {
  security: { counts: { new: 4, resolved: 2, newSev: { critical: 1, major: 1 }, resolvedSev: { major: 1 } }, types: { opened: ['S-1'], closed: [] } },
  usability: { counts: { new: 0, resolved: 1 } },
} };

const violation = (file, severity, req) => ({ file, severity, req, title: `rule ${req}`, principle: 'Input', dimension: 'security' });
const FINDINGS = [
  { dimension: 'security', violations: [violation('src/api/a.py', 'critical', 'S-1'), violation('src/api/b.py', 'major', 'S-2')], compliance: [] },
  { dimension: 'usability', violations: [], compliance: [] },
];

function fakeApi(overrides = {}) {
  return {
    getRunLog: vi.fn(async () => ({ runs: [runEntry, firstEntry], running: null })),
    getRunDiff: vi.fn(async () => DIFF),
    getDashboard: vi.fn(async () => ({ selectedRun: { runId: 'r1', dateISO: BASE_ISO }, dimensions: BASE_DIMS })),
    getRunScores: vi.fn(async () => ({ dimensions: FINDINGS })),
    ...overrides,
  };
}

function renderRun({ runId = 'r2', dimensions = RUN_DIMS, api = fakeApi(), ...props } = {}) {
  const dashboard = { selectedRun: { runId, dateISO: runId === 'r2' ? RUN_ISO : BASE_ISO, dateLabel: '8 Oct 2026' }, dimensions };
  const view = render(
    <RunOverviewPanel dashboard={dashboard} selectedRunId={runId} selectedProject="p" selectedSource="local" projectName="proj" {...props} />,
    { wrapper: withStableQueryApi(api) },
  );
  return { ...view, api };
}

const head = (container) => container.querySelector('.findings-head');
const cardNames = (container) => [...container.querySelectorAll('.dim-gauge-card__name')].map((n) => n.textContent);

describe('RunOverviewPanel header', () => {
  it('names the run by when it ran, and where it came from, the model, commit, duration and files', async () => {
    const { container } = renderRun();
    expect(head(container).querySelector('.term-header__name').textContent.replace(/\u00a0/g, ' ')).toBe(`run · ${formatRunWhen(RUN_ISO)}`);
    await waitFor(() => expect(head(container)).toHaveTextContent(/nightly · qwen · abc1234 · took\s.+ · 346\sfiles/));
  });

  it('shows its tiles with their change since the previous run', async () => {
    const { container } = renderRun();
    const tiles = [...head(container).querySelectorAll('.findings-head__label')].map((n) => n.textContent);
    expect(tiles).toEqual(['Violations', 'Pass rate', 'Per 100 files', 'Critical per 1k']);
    // critical 0 -> 1 (+1), major 3 -> 2 (-1); critical per 1,000 moved, per 100 and the pass rate did not.
    await waitFor(() => expect(head(container).querySelectorAll('.term-sev-badge__delta')).toHaveLength(2));
    expect(head(container).querySelectorAll('.findings-head__change')).toHaveLength(1);
    expect(head(container)).toHaveTextContent('12 suppressed');
  });

  it('says a rescored run was scanned with an older formula, and why behind its help button', () => {
    const { container } = renderRun({ formulaUpdated: true });
    expect(within(head(container)).getByText(/rescored · current formula/)).toBeInTheDocument();
    fireEvent.click(within(head(container)).getByRole('button', { name: 'Why this run was rescored' }));
    expect(within(head(container)).getByRole('tooltip')).toHaveTextContent(/older grade formula/);
  });
});

describe('RunOverviewPanel since line and cards', () => {
  it('counts the new and fixed findings since the previous run, and the dimension that moved most', async () => {
    const { container } = renderRun();
    const strip = await screen.findByRole('region', { name: 'since the previous run' });
    await waitFor(() => expect(strip).toHaveTextContent('4 new'));
    expect(strip).toHaveTextContent('3 fixed');
    expect(strip).toHaveTextContent('1 rule types opened');
    await waitFor(() => expect(within(strip).getByRole('button', { name: /security/ })).toBeInTheDocument());
    expect(container.querySelectorAll('.overview-since__mover')).toHaveLength(1);
  });

  it('shows the dimensions weakest first, each with what the run changed in it', async () => {
    const { container } = renderRun();
    expect(cardNames(container)).toEqual(['security', 'usability']);
    await waitFor(() => expect(container.querySelectorAll('.rl-card-moves')).toHaveLength(2));
    const security = container.querySelectorAll('.dim-gauge-card')[0];
    expect(security).toHaveTextContent('+4 new');
    expect(security).toHaveTextContent('1 crit · 1 maj');
    expect(security).toHaveTextContent('−2 fixed');
  });

  it('opens a card\'s dimension as of the run', () => {
    const onDimensionClick = vi.fn();
    const { container } = renderRun({ onDimensionClick });
    fireEvent.click(container.querySelector('.dim-gauge-card'));
    expect(onDimensionClick).toHaveBeenCalledWith(expect.objectContaining({ dimension: 'security' }), 'r2');
  });
});

describe('RunOverviewPanel on a run with no previous run', () => {
  const renderFirst = () => renderRun({ runId: 'r1', dimensions: BASE_DIMS });

  it('says on the since line there is nothing to compare with', async () => {
    renderFirst();
    const strip = await screen.findByRole('region', { name: 'since the previous run' });
    expect(strip).toHaveTextContent('first run with these dimensions: nothing to compare with');
  });

  it('says not compared on every card', async () => {
    renderFirst();
    await waitFor(() => expect(screen.getAllByText('not compared')).toHaveLength(2));
  });

  it('shows no changes or movers and asks for no diff', async () => {
    const { container, api } = renderFirst();
    await screen.findByRole('region', { name: 'since the previous run' });
    expect(head(container).querySelector('.findings-head__change, .term-sev-badge__delta')).toBeNull();
    expect(container.querySelector('.overview-since__mover')).toBeNull();
    expect(api.getRunDiff).not.toHaveBeenCalled();
  });
});

describe('RunOverviewPanel bottom', () => {
  it('puts Fix first beside the run\'s folders or files, no areas, folders first', async () => {
    renderRun();
    const where = await screen.findByRole('group', { name: /where/i });
    expect(within(where).getAllByRole('button').map((b) => b.textContent)).toEqual(['folders', 'files']);
    expect(within(where).getByRole('button', { name: 'folders' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('region', { name: /fix first/i })).toBeInTheDocument();
  });

  it('opens the tiles, Fix first, a folder and a file as read-only scoped views as of the run', async () => {
    const onNavigate = vi.fn();
    const { container } = renderRun({ onNavigate });
    const asOf = { runId: 'r2', day: '2026-10-08' };
    fireEvent.click(head(container).querySelector('.findings-head__hit'));
    fireEvent.click(await screen.findByText('rule S-1'));
    fireEvent.click(within(container.querySelector('.folders-panel')).getAllByRole('row')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    fireEvent.click(await screen.findByText('a.py'));
    expect(onNavigate.mock.calls.map(([page, p]) => [page, p.scope.kind, p.asOf])).toEqual([
      ['violations', 'project', asOf], ['violations', 'requirement', asOf], ['violations', 'folder', asOf], ['violations', 'file', asOf],
    ]);
  });
});

describe('RunOverviewPanel loading', () => {
  it('shows the run page\'s skeleton until the run\'s dimensions land', () => {
    const { container } = renderRun({ dimensions: null });
    expect(container.querySelector('.overview-skeleton')).not.toBeNull();
    expect(container.querySelector('.overview-skeleton .term-header')).toHaveTextContent('run');
    expect(container.querySelector('.overview-skeleton .overview-top-grid')).toBeNull();
    expect(container.querySelector('.loading-screen')).toBeNull();
  });
});
