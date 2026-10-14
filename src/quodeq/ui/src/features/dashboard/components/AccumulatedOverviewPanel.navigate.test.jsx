import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AccumulatedOverviewPanel from './AccumulatedOverviewPanel.jsx';
import { SidePaneProvider } from '../../side-pane/SidePaneProvider.jsx';

// Each panel is a button that hands its callback one row: this test is about where the Overview sends it.
vi.mock('./RiskAreasPanel.jsx', () => ({ default: () => null }));
vi.mock('./AccumulatedHeroSection.jsx', () => ({
  AccumulatedHeroSection: ({ onCardNavigate }) => (
    <>
      <button type="button" onClick={() => onCardNavigate('violations')}>hero all</button>
      <button type="button" onClick={() => onCardNavigate('critical')}>hero critical</button>
      <button type="button" onClick={() => onCardNavigate('compliance')}>hero compliance</button>
    </>
  ),
}));
vi.mock('./TopOffendingFilesTable.jsx', () => ({
  default: ({ onFileClick }) => <button type="button" onClick={() => onFileClick({ file: 'src/a.py' })}>file row</button>,
}));
vi.mock('./FixFirstPanel.jsx', () => ({
  default: ({ onRequirementClick }) => (
    <button type="button" onClick={() => onRequirementClick({ dimension: 'security', req: 'S-1', text: 'Hash it' })}>req row</button>
  ),
}));
vi.mock('./FindingsByFolderPanel.jsx', () => ({
  default: ({ onFolderClick }) => <button type="button" onClick={() => onFolderClick({ dir: 'src/api' })}>folder row</button>,
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
  it('on today: the hero cards open the project on their filter', () => {
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
    click('file row');
    click('req row');
    click('folder row');
    expect(onNavigate.mock.calls).toEqual([
      ['violations', { scope: { kind: 'file', path: 'src/a.py' }, asOf: null }],
      ['violations', { scope: { kind: 'requirement', dimension: 'security', req: 'S-1', text: 'Hash it' }, asOf: null }],
      ['violations', { scope: { kind: 'folder', path: 'src/api' }, asOf: null }],
    ]);
  });

  it('on a past run every entry opens that run, read-only', () => {
    const onNavigate = renderPanel('r1');
    click('hero critical');
    click('file row');
    click('req row');
    click('folder row');
    const asOf = { runId: 'r1', day: '2026-10-01' };
    expect(onNavigate.mock.calls.map((c) => c[1].asOf)).toEqual([asOf, asOf, asOf, asOf]);
  });
});
