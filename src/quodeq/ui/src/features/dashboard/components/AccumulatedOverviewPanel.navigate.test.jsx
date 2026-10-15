import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AccumulatedOverviewPanel from './AccumulatedOverviewPanel.jsx';
import { SidePaneProvider } from '../../side-pane/SidePaneProvider.jsx';

// Each panel is a button that hands its callback one row: this test is about where the Overview sends it.
const AREA = { kind: 'area', name: 'api', paths: ['src/api/'], small: false };
vi.mock('../../map/components/RiskAreasPanel.jsx', () => ({
  default: ({ dimensions, onAreaFindings, onAreaInMap }) => (
    <>
      <button type="button" onClick={() => onAreaFindings(AREA)}>area row {String(dimensions ?? 'all')}</button>
      <button type="button" onClick={() => onAreaInMap({ name: 'api' })}>area in map</button>
    </>
  ),
}));
// The header's previous period, since line and model read through react-query too.
vi.mock('../hooks/useOverviewPeriod.js', () => ({ usePreviousPeriodMetrics: () => null, useOverviewSince: () => null, useRunModel: () => null }));
vi.mock('./OverviewHead.jsx', () => ({
  default: ({ onCardNavigate }) => (
    <>
      <button type="button" onClick={() => onCardNavigate('violations')}>hero all</button>
      <button type="button" onClick={() => onCardNavigate('critical')}>hero critical</button>
      <button type="button" onClick={() => onCardNavigate('compliance')}>hero compliance</button>
    </>
  ),
}));
vi.mock('../../../components/TopOffendingFilesTable.jsx', () => ({
  default: ({ onFileClick }) => <button type="button" onClick={() => onFileClick({ file: 'src/a.py' })}>file row</button>,
  OffendingFilesHead: () => null,
}));
vi.mock('../../../components/FixFirstPanel.jsx', () => ({
  default: ({ onRequirementClick }) => (
    <button type="button" onClick={() => onRequirementClick({ dimension: 'security', req: 'S-1', text: 'Hash it' })}>req row</button>
  ),
}));
vi.mock('../../../components/FindingsByFolderPanel.jsx', () => ({
  default: ({ onFolderClick, onFolderInMap }) => (
    <>
      <button type="button" onClick={() => onFolderClick({ dir: 'src/api' })}>folder row</button>
      {onFolderInMap && <button type="button" onClick={() => onFolderInMap({ dir: 'src/api' })}>folder in map</button>}
    </>
  ),
}));

const DIMS = [{ dimension: 'security', overallScore: '7.0/10', fromRunId: 'r2', violations: [{ file: 'src/a.py', severity: 'major' }] }];
const RUNS = [
  { runId: 'r3', dateISO: '2026-10-14T09:00:00', status: 'running' },
  { runId: 'r2', dateISO: '2026-10-12T09:00:00', status: 'done' },
  { runId: 'r1', dateISO: '2026-10-01T09:00:00', status: 'done' },
];

function renderPanel(selectedRunId) {
  const onNavigate = vi.fn();
  const data = {
    accumulated: { summary: { numericAverage: 7 }, dimensions: DIMS }, accumulatedDimensions: DIMS,
    availableRuns: RUNS, dailyRuns: null, overviewRunIndex: 0, trend: [], selectedRunId,
    granularity: 'day', projectInfo: null, selectedProject: 'proj1', selectedSource: 'local',
  };
  render(<SidePaneProvider><AccumulatedOverviewPanel data={data} callbacks={{ onNavigate }} /></SidePaneProvider>);
  return onNavigate;
}

const click = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('AccumulatedOverviewPanel opens scoped Findings views', () => {
  it('on today: the header tiles open the project on their filter', () => {
    const onNavigate = renderPanel('r2');
    click('hero all');
    click('hero critical');
    click('hero compliance');
    expect(onNavigate.mock.calls).toEqual([
      ['violations', { scope: { kind: 'project', filter: null }, asOf: null }],
      ['violations', { scope: { kind: 'project', filter: 'critical' }, asOf: null }],
      ['violations', { scope: { kind: 'project', filter: 'compliance' }, asOf: null }],
    ]);
  });

  it('on today: a file, a requirement and a folder open their scope', () => {
    const onNavigate = renderPanel(null);
    click('files');
    click('file row');
    click('req row');
    click('folders');
    click('folder row');
    expect(onNavigate.mock.calls).toEqual([
      ['violations', { scope: { kind: 'file', path: 'src/a.py' }, asOf: null }],
      ['violations', { scope: { kind: 'requirement', dimension: 'security', req: 'S-1', text: 'Hash it' }, asOf: null }],
      ['violations', { scope: { kind: 'folder', path: 'src/api' }, asOf: null }],
    ]);
  });

  it('an area row opens its scope over every finding; its map icon, the Risk tab with the area selected', () => {
    const onNavigate = renderPanel(null);
    click('area row all');
    click('area in map');
    expect(onNavigate.mock.calls).toEqual([
      ['violations', { scope: AREA, asOf: null }],
      ['map', { vizStyle: 'risk', area: 'api' }],
    ]);
  });

  it('a folder\'s map icon opens the circle pack on that folder', () => {
    const onNavigate = renderPanel(null);
    click('folders');
    click('folder in map');
    expect(onNavigate.mock.calls).toEqual([['map', { vizStyle: 'zoompack', path: 'src/api' }]]);
  });

  it('remembers the chosen view when the Overview comes back', () => {
    sessionStorage.clear();
    renderPanel(null);
    click('folders');
    cleanup();
    renderPanel(null);
    expect(screen.getByRole('button', { name: 'folders' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('an area opens today\'s view on a past run too: the Map measures today\'s findings', () => {
    const onNavigate = renderPanel('r1');
    click('area row all');
    expect(onNavigate.mock.calls).toEqual([['violations', { scope: AREA, asOf: null }]]);
  });

  it('on a past run every entry opens that run, read-only', () => {
    const onNavigate = renderPanel('r1');
    click('hero critical');
    click('files');
    click('file row');
    click('req row');
    click('folders');
    click('folder row');
    const asOf = { runId: 'r1', day: '2026-10-01' };
    expect(onNavigate.mock.calls.map((c) => c[1].asOf)).toEqual([asOf, asOf, asOf, asOf]);
  });
});
