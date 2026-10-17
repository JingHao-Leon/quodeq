import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import ProjectsPage from './ProjectsPage.jsx';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { SidePaneProvider } from '../../side-pane/index.js';

// Repositories before anything was evaluated: a fresh row says so and
// offers evaluate, an empty page shows the three ways in.
function makeFakeApi() {
  const api = {
    getSharedStatus: vi.fn(async () => ({ configured: false, url: null })),
    sharedListProjects: vi.fn(async () => ({ projects: [], lastSynced: null, stale: false })),
  };
  return { getSyncStatus: (...a) => api.getSharedStatus(...a), ...api };
}

function renderPage(props) {
  const QC = withQueryClient();
  return render(
    <QC>
      <ApiProvider value={makeFakeApi()}>
        <SidePaneProvider><ProjectsPage {...props} /></SidePaneProvider>
      </ApiProvider>
    </QC>,
  );
}

const FRESH = { id: 'fresh', name: 'fresh', runsCount: 0, latestRunId: null };
const DONE = { id: 'done', name: 'done', runsCount: 2, latestRunId: 'r2', latestGrade: 'B', latestDate: '2026-10-08' };

const rowOf = (name) => screen.getByRole('button', { name }).closest('[role="row"]');

describe('ProjectsPage before an evaluation', () => {
  it('row without runs offers evaluate', async () => {
    const user = userEvent.setup();
    const onEvaluate = vi.fn();
    renderPage({ projects: [FRESH, DONE], actions: { onEvaluate } });
    const row = rowOf('fresh');
    expect(within(row).getByText('not evaluated yet')).toBeInTheDocument();
    const evaluate = within(row).getByRole('button', { name: 'evaluate fresh' });
    expect(evaluate).toHaveClass('term-btn', 'term-btn--secondary');
    expect(within(rowOf('done')).queryByText('not evaluated yet')).not.toBeInTheDocument();
    await user.click(evaluate);
    expect(onEvaluate).toHaveBeenCalledWith('fresh');
  });

  it('the header counts the evaluated ones', () => {
    renderPage({ projects: [FRESH, DONE], actions: {} });
    expect(screen.getByText('1 of 2 evaluated')).toBeInTheDocument();
  });

  it('an empty page shows the ways in, wired to the header actions', async () => {
    const user = userEvent.setup();
    const onAddProject = vi.fn();
    const onConnectEvaluations = vi.fn();
    const onImportProject = vi.fn();
    renderPage({ projects: [], actions: { onAddProject, onConnectEvaluations, onImportProject } });
    expect(screen.getByText('A repository')).toBeInTheDocument();
    const paths = document.querySelector('.projects-empty-paths');
    await user.click(within(paths).getByRole('button', { name: 'start' }));
    await user.click(within(paths).getByRole('button', { name: 'connect' }));
    await user.click(within(paths).getByRole('button', { name: 'import' }));
    expect(onAddProject).toHaveBeenCalledTimes(1);
    expect(onConnectEvaluations).toHaveBeenCalledTimes(1);
    expect(onImportProject).toHaveBeenCalledTimes(1);
  });
});
