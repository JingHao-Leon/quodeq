/**
 * Accessibility test for ViolationsPage.
 * 6146: the restore-error banner appears without the user asking for it, so
 * it has to announce itself (role="alert"). The page state hook is mocked so
 * the banner can be forced without driving a failing restore mutation.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ViolationsPage from './ViolationsPage.jsx';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';

// The fix-plan pill needs the app's side pane; the page under test is the
// wiring around it, so the pill is a stub here.
vi.mock('../workbench/FixPlanButton.jsx', () => ({ default: () => <button type="button">fix plan</button> }));

const RESTORE_ERROR = 'Restore failed: findings file is read-only';

const pageState = {
  dismissed: [],
  handleRestore: vi.fn(), handleRestoreAll: vi.fn(),
  handleDelete: vi.fn(), handleDeleteAll: vi.fn(),
  restoreError: RESTORE_ERROR,
  visibleDimensions: [{ dimension: 'security', fromRunId: 'r1', violations: [
    { title: 'Key logged', file: 'a.py', line: 1, severity: 'major', req: 'S-1' },
    { title: 'Weak hash', file: 'b.py', line: 2, severity: 'minor', req: 'S-2' },
  ] }],
  summary: { totalViolations: 0, severity: {} },
};

vi.mock('../hooks/useViolationsPageState.js', () => ({
  useViolationsPageState: () => pageState,
}));

const DATA = {
  accumulatedDimensions: [{ dimension: 'security', violations: [], compliance: [] }],
  selectedProject: 'p1',
  projects: [{ id: 'p1', name: 'p1' }],
  projectsLoaded: true,
  projectName: 'p1',
  loading: false,
  isFetching: false,
  selectedSource: 'local',
};

describe('ViolationsPage restore-error banner (6146)', () => {
  it('announces the banner through role="alert"', () => {
    const QC = withQueryClient();
    render(<QC><ViolationsPage data={DATA} callbacks={{}} /></QC>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(RESTORE_ERROR);
    expect(alert).toHaveClass('error-banner');
  });
});

describe('ViolationsPage workbench a11y', () => {
  it('has a labelled search, a named list of row buttons and one current row', async () => {
    const QC = withQueryClient();
    render(<QC><ViolationsPage data={DATA} callbacks={{}} workbench={null} onWorkbenchChange={() => {}} /></QC>);
    expect(await screen.findByRole('textbox', { name: 'Search findings' })).toBeInTheDocument();
    const list = screen.getByLabelText('Findings');
    expect(list.querySelectorAll('button.wb-row')).toHaveLength(2);
    expect(screen.getAllByRole('button', { current: true })).toHaveLength(1);
  });
});
