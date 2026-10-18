import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ViolationsPage from './ViolationsPage.jsx';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { t } from '../../../strings/index.js';

// The fix-plan pill needs the app's side pane; here it is a stub.
vi.mock('../workbench/FixPlanButton.jsx', () => ({ default: () => <button type="button">fix plan</button> }));

const dim = (title) => [{
  dimension: 'security', fromRunId: 'run-1', compliance: [],
  violations: [{ title, file: 'src/a.py', line: 3, severity: 'major', principle: 'P1', req: 'S-1' }],
}];
const data = (asOf) => ({
  selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }], projectsLoaded: true,
  projectName: 'p1', loading: false, isFetching: false, accumulatedDimensions: dim('Today finding'), asOf,
});

function renderPage(asOf, callbacks = {}) {
  const api = {
    listDismissedFindings: async () => [],
    getProjectScores: vi.fn(async () => ({ accumulated: { dimensions: dim('Past finding') } })),
  };
  const QC = withQueryClient();
  render(
    <QC>
      <ApiProvider value={api}>
        <ViolationsPage data={data(asOf)} callbacks={callbacks} workbench={null} onWorkbenchChange={() => {}} />
      </ApiProvider>
    </QC>,
  );
  return api;
}

describe('ViolationsPage as of a past day', () => {
  it('shows that day\'s findings, read as of its last run, under a banner', async () => {
    const api = renderPage({ runId: 'run-7', day: '2026-08-07' }, { onBackToToday: vi.fn() });
    expect((await screen.findAllByText('Past finding')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Today finding')).toBeNull();
    expect(api.getProjectScores).toHaveBeenCalledWith('p1', 'run-7');
    expect(screen.getByRole('button', { name: t('violations.asOfBack') })).toBeInTheDocument();
  });

  it('is read-only: the detail offers no fix plan', async () => {
    renderPage({ runId: 'run-7', day: '2026-08-07' });
    fireEvent.click((await screen.findAllByText('Past finding'))[0]);
    expect(await screen.findByRole('heading', { name: 'Past finding' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'fix plan' })).toBeNull();
  });

  it('goes back to today from the banner', async () => {
    const onBackToToday = vi.fn();
    renderPage({ runId: 'run-7', day: '2026-08-07' }, { onBackToToday });
    fireEvent.click(await screen.findByRole('button', { name: t('violations.asOfBack') }));
    expect(onBackToToday).toHaveBeenCalled();
  });

  it('without a past day it shows today and asks for nothing', async () => {
    const api = renderPage(null);
    expect((await screen.findAllByText('Today finding')).length).toBeGreaterThan(0);
    expect(api.getProjectScores).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: t('violations.asOfBack') })).toBeNull();
  });
});
