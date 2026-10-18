import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ScopedFindings from './ScopedFindings.jsx';
import { readScope } from './scopeModel.js';
import { SidePaneProvider } from '../../side-pane/index.js';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';

// The header's tiles. Queries stay inside them: the since row may show a random loading tip, and a tip
// can bold the same word as a tile ("On the Map's **Risk** tab"), so a page-wide query would flake.
const headTiles = () => within(document.querySelector('section.findings-head .findings-head__stats'));

const deltas = vi.hoisted(() => ({ map: new Map(), args: null, previous: null, diffs: [], areas: [], riskArgs: null, seriesRows: [] }));

vi.mock('../../../utils/pretext.js', async (importOriginal) => ({
  ...(await importOriginal()), measureWidth: () => 0, cssFontFromElement: () => '12px monospace',
}));
vi.mock('../../explorer/hooks/useStandardDescriptions.js', () => ({ useStandardDescriptions: () => ({ principleDescriptions: {} }) }));
vi.mock('../../../hooks/usePrinciplePeriodDeltas.js', () => ({
  usePrinciplePeriodDeltas: (args) => { deltas.args = args; return { principles: deltas.map, previous: deltas.previous, beforeRunId: 'run-before' }; },
}));
vi.mock('../../../hooks/usePrincipleSeries.js', () => ({ usePrincipleSeries: () => ({ rows: deltas.seriesRows, loading: false, error: null }) }));
vi.mock('../../../hooks/usePeriodDiffs.js', () => ({ usePeriodDiffs: () => ({ runs: ['run-sec'], payloads: deltas.diffs }) }));
vi.mock('../../map/hooks/useRiskAreas.js', () => ({
  default: (args) => { if (args.active) deltas.riskArgs = args; return { areas: deltas.areas, loading: false, failed: false }; },
}));

const v = (over) => ({ file: 'src/app.py', dimension: 'security', principle: 'Input', ...over });
const DIMS = [{
  dimension: 'security', fromRunId: 'run-sec', fromDateLabel: '14 Oct 2026', filesRead: 50, principles: [{ name: 'Input', score: 7.7, grade: 'good' }],
  violations: [
    v({ line: 5, severity: 'critical', req: 'R2', title: 'Secret in code' }),
    v({ line: 9, severity: 'major', req: 'R1', title: 'Unchecked input' }),
    v({ line: 30, severity: 'minor', req: 'R1', title: 'Loose parse' }),
  ],
  compliance: [v({ line: 12, req: 'R3', title: 'Escaped output' }), v({ line: 14, req: 'R1', title: 'Checked form' })],
}];
const HISTORY = { project: 'p1', selectedSource: 'local', trend: [], granularity: 'week', runId: null };

function renderPrinciple(history = HISTORY, onOpenMap = undefined) {
  return render(
    <SidePaneProvider>
      <ScopedFindings dims={DIMS} projectName="proj" dateLabel={null} onDismissFinding={vi.fn()} history={history} onOpenMap={onOpenMap}
        scope={readScope({ kind: 'principle', dimension: 'security', principle: 'Input' })} />
    </SidePaneProvider>,
    { wrapper: withQueryClient() },
  );
}

const rowTitles = (container) => [...container.querySelectorAll('.wb-row__t')].map((n) => n.textContent.replace('✓ ', ''));
const kindButtons = () => within(screen.getByRole('group', { name: t('violations.scopeKindAria') })).getAllByRole('button').map((b) => b.textContent);
const headers = (container) => [...container.querySelectorAll('.req-group')];
const header = (container, id) => headers(container).find((n) => n.querySelector('.req-group__id').textContent === id);
const sortButton = (name) => within(screen.getByRole('group', { name: t('violations.scopeSortAria') })).getByRole('button', { name });
const reqMenu = (value) => screen.getByRole('button', { name: t('violations.wbMenuButton', { label: t('violations.scopeReqMenu'), value }) });

describe('ScopedFindings, a principle', () => {
  beforeEach(() => { deltas.map = new Map(); deltas.previous = null; deltas.diffs = []; deltas.areas = []; deltas.riskArgs = null; deltas.seriesRows = []; });

  it('heads with its requirements failing of checked, in place of the per-file tiles', () => {
    renderPrinciple();
    const tile = screen.getByText(t('violations.scopeStatReqs')).closest('.findings-head__stat');
    expect(tile).toHaveTextContent(t('violations.scopeStatReqsValue', { failing: 2, total: 3 }));
    expect(screen.queryByText(t('violations.scopeStatCriticalK'))).toBeNull();
  });

  it('opens grouped by requirement, worst first, only the worst open; a header folds or opens its findings', () => {
    const { container } = renderPrinciple();
    expect(sortButton(t('violations.scopeSort_requirement'))).toHaveAttribute('aria-pressed', 'true');
    expect(headers(container).map((n) => n.querySelector('.req-group__id').textContent)).toEqual(['R2', 'R1', 'R3']);
    expect(rowTitles(container)).toEqual(['Secret in code']);
    fireEvent.click(header(container, 'R1'));
    expect(rowTitles(container)).toEqual(['Secret in code', 'Unchecked input', 'Loose parse', 'Checked form']);
    fireEvent.click(header(container, 'R2'));
    expect(rowTitles(container)).toEqual(['Unchecked input', 'Loose parse', 'Checked form']);
    expect(header(container, 'R1')).toHaveTextContent(t('violations.scopeReqFile'));
  });

  it('opens every group or folds them all; by severity reads the list without headers', () => {
    const { container } = renderPrinciple();
    fireEvent.click(screen.getByRole('button', { name: t('violations.scopeReqOpenAll') }));
    expect(rowTitles(container)).toEqual(['Secret in code', 'Unchecked input', 'Loose parse', 'Checked form', 'Escaped output']);
    fireEvent.click(screen.getByRole('button', { name: t('violations.scopeReqFoldAll') }));
    expect(rowTitles(container)).toEqual([]);
    fireEvent.click(sortButton(t('violations.scopeSort_severity')));
    expect(headers(container)).toHaveLength(0);
    expect(rowTitles(container)).toEqual(['Secret in code', 'Unchecked input', 'Loose parse', 'Escaped output', 'Checked form']);
  });

  it('the requirement menu narrows the list and the kind counts, says so above the list, and shows all again', () => {
    const { container } = renderPrinciple();
    fireEvent.click(reqMenu(t('violations.wbAll')));
    fireEvent.click(screen.getAllByRole('menuitemradio').find((n) => n.textContent.startsWith('R1')));
    expect(reqMenu('R1')).toBeInTheDocument();
    expect(rowTitles(container)).toEqual(['Unchecked input', 'Loose parse', 'Checked form']);
    expect(kindButtons()).toEqual([t('violations.scopeKindAll'), 'major1', 'minor1', `${t('violations.scopeCompliantShort')}1`]);
    expect(container.querySelector('.req-note')).toHaveTextContent(t('violations.scopeReqOnly', { req: 'R1', shown: 3, total: 5 }));
    fireEvent.click(screen.getByRole('button', { name: t('violations.scopeReqShowAll', { count: 3 }) }));
    expect(container.querySelector('.req-note')).toBeNull();
    expect(rowTitles(container)).toEqual(['Secret in code']);
  });

  it('the requirement menu finds a requirement by its words', () => {
    renderPrinciple();
    fireEvent.click(reqMenu(t('violations.wbAll')));
    fireEvent.change(screen.getByRole('searchbox', { name: t('violations.scopeReqSearchAria') }), { target: { value: 'secret' } });
    expect(screen.getAllByRole('menuitemradio').map((n) => n.querySelector('.req-menu__id, .req-menu__all').textContent)).toEqual([t('violations.scopeReqAll'), 'R2']);
  });

  it('reads its change since the previous period from the history it is handed, hidden under 0.05', () => {
    deltas.map = new Map([['Input', 0.4]]);
    const { container, unmount } = renderPrinciple();
    expect(deltas.args).toMatchObject({ project: 'p1', granularity: 'week', dimension: 'security', activeRunId: 'run-sec' });
    expect(container.querySelector('.findings-head .trend-badge-delta')).toHaveTextContent('+0.4');
    unmount();
    deltas.map = new Map([['Input', 0.03]]);
    const again = renderPrinciple();
    expect(again.container.querySelector('.findings-head .trend-badge')).toBeNull();
  });

  it('heads with its name in lowercase and a sub line of kind, dimension and date', () => {
    const { container } = renderPrinciple();
    expect(container.querySelector('.findings-head .term-header__name')).toHaveTextContent('input');
    expect(container.querySelector('.findings-head .term-header__sub')).toHaveTextContent('principle · security · 14 Oct 2026');
  });

  it('reads its tiles\' and severities\' changes against its findings in the previous period\'s run', () => {
    const was = (severity, req) => v({ severity, req, line: 1 });
    deltas.previous = { violations: [was('major', 'R1'), was('major', 'R1'), v({ principle: 'Other', severity: 'critical' })], compliance: [v({ req: 'R3' })] };
    const { container } = renderPrinciple();
    // Pass rate 40% now (2 of 5), 33% before (1 of 3): seven points up.
    expect(container.querySelector('.findings-head__change')).toHaveTextContent('+7');
    // One critical, one major, one minor now; two majors then.
    const sevDeltas = [...container.querySelectorAll('.findings-head .term-sev-badge__delta .trend-badge-delta')].map((n) => n.textContent);
    expect(sevDeltas).toEqual(['+1', '-1', '+1']);
  });

  it('reads the since line narrowed to its own findings, quiet when none moved', () => {
    const security = { counts: { new: 9, resolved: 9 }, new: [v({}), v({ principle: 'Other' })], resolved: [], types: { opened: ['X'], closed: [] } };
    deltas.diffs = [{ dimensions: { security } }];
    const { unmount } = renderPrinciple();
    expect(screen.getByRole('region', { name: 'since the previous week' })).toHaveTextContent('1 new');
    unmount();
    deltas.diffs = [{ dimensions: { security: { ...security, new: [] } } }];
    renderPrinciple();
    expect(screen.getByRole('region', { name: 'since the previous week' })).toHaveTextContent('no new or fixed findings');
  });

  it('draws its score per period of the chart\'s grouping under its description, once its series has two', () => {
    const { container, unmount } = renderPrinciple();
    expect(container.querySelector('.findings-head .score-spark')).toBeNull();
    unmount();
    const row = (runId, dateISO, score) => ({ runId, dateISO, dateLabel: dateISO.slice(0, 10), principles: [{ principle: 'Input', score }] });
    deltas.seriesRows = [row('b', '2026-10-13T10:00:00', 7.7), row('a', '2026-10-01T10:00:00', 6.5)];
    renderPrinciple();
    expect(screen.getByRole('img', { name: t('violations.sparkAria', { principle: 'Input' }) })).toBeInTheDocument();
    expect(screen.getByText(t('violations.sparkRange', { count: 2, first: '2026-10-01', last: '2026-10-13' }))).toBeInTheDocument();
  });

  it('says it shows a past run in its header, with the way back', () => {
    const onBack = vi.fn();
    const { container } = renderPrinciple({ ...HISTORY, runId: 'run-old', pastRun: { when: '2026-10-01', onBack } });
    expect(container.querySelector('.findings-head__past')).toHaveTextContent(t('violations.headPastLabel'));
    expect(container.querySelector('.findings-head__past-when')).toHaveTextContent('2026-10-01');
    fireEvent.click(screen.getByRole('button', { name: t('violations.headBackToLatest') }));
    expect(onBack).toHaveBeenCalled();
  });

  it('reads its Risk: the Map\'s areas measured over its findings, per zone, opening the Risk tab on it', () => {
    const zone = (name, z) => ({ name, zone: z });
    deltas.areas = [zone('api', 'fixFirst'), zone('core', 'fixFirst'), zone('ui', 'watch'), zone('docs', 'healthy')];
    const onOpenMap = vi.fn();
    renderPrinciple(HISTORY, onOpenMap);
    expect(deltas.riskArgs).toMatchObject({ project: 'p1', dimensions: ['security'], principle: 'Input' });
    const tile = headTiles().getByText(t('violations.scopeStatRisk')).closest('.findings-head__stat');
    expect(tile).toHaveTextContent('2 fix first · 1 watch');
    fireEvent.click(within(tile).getByRole('button'));
    expect(onOpenMap).toHaveBeenCalledWith({ vizStyle: 'risk', dimensions: ['security'], principle: 'Input' });
  });

  it('reads "none" when no area of its findings needs rework', () => {
    deltas.areas = [{ name: 'docs', zone: 'healthy' }];
    renderPrinciple();
    expect(headTiles().getByText(t('violations.scopeStatRisk')).closest('.findings-head__stat')).toHaveTextContent('none');
  });
});
