import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RunOverviewPanel from './RunOverviewPanel.jsx';

// The run's findings, its report and its cards are other tests' business: here
// each entry is a button, and the test is where it sends the reader.
vi.mock('../hooks/useRunFindings.js', () => ({ useRunFindings: () => ({ dimensions: [] }) }));
vi.mock('./runReportSpecs.jsx', () => ({ useRunReportSpecs: () => {} }));
vi.mock('../runViewData.js', () => ({
  buildRunViewData: () => ({ dimensions: [], runSummary: {}, since: {}, runTopFiles: [{ file: 'src/a.py' }], headline: {} }),
}));
vi.mock('./RunHeroSection.jsx', () => ({
  RunHeroSection: ({ onCardNavigate }) => <button type="button" onClick={() => onCardNavigate('major')}>hero major</button>,
}));
vi.mock('../../../components/TopOffendingFilesTable.jsx', () => ({
  default: ({ onFileClick }) => <button type="button" onClick={() => onFileClick({ file: 'src/a.py' })}>file row</button>,
}));

describe('RunOverviewPanel opens a chosen run\'s findings as of that run', () => {
  it('the hero cards and the files table open read-only scopes of the run', () => {
    const onNavigate = vi.fn();
    const dashboard = { selectedRun: { runId: 'r5', dateISO: '2026-09-30T10:00:00', dateLabel: '30 Sep' }, dimensions: [] };
    render(<RunOverviewPanel dashboard={dashboard} selectedRunId="r5" selectedProject="p" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'hero major' }));
    fireEvent.click(screen.getByRole('button', { name: 'file row' }));
    const asOf = { runId: 'r5', day: '2026-09-30' };
    expect(onNavigate.mock.calls).toEqual([
      ['violations', { scope: { kind: 'project', filter: 'major' }, asOf }],
      ['violations', { scope: { kind: 'file', path: 'src/a.py' }, asOf }],
    ]);
  });
});
