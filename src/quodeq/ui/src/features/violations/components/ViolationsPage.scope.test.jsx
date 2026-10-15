import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ViolationsPage from './ViolationsPage.jsx';
import { SidePaneProvider } from '../../side-pane/index.js';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { t } from '../../../strings/index.js';

const dim = (title) => [{
  dimension: 'security', fromRunId: 'run-1', compliance: [],
  violations: [{ title, file: 'src/a.py', line: 3, severity: 'major', principle: 'P1', req: 'S-1', dimension: 'security' }],
}];

function renderPage({ asOf = null, callbacks = {} } = {}) {
  const api = {
    listDismissedFindings: async () => [],
    getProjectScores: vi.fn(async () => ({ accumulated: { dimensions: dim('Past finding') } })),
  };
  const data = {
    selectedSource: 'local', selectedProject: 'p1', projects: [{ id: 'p1', name: 'p1' }], projectsLoaded: true,
    projectName: 'p1', loading: false, isFetching: false, accumulatedDimensions: dim('Today finding'), asOf,
    scope: { kind: 'file', path: 'src/a.py', filter: null },
  };
  const QC = withQueryClient();
  render(
    <QC>
      <ApiProvider value={api}>
        <SidePaneProvider>
          <ViolationsPage data={data} callbacks={callbacks} workbench={null} onWorkbenchChange={() => {}} />
        </SidePaneProvider>
      </ApiProvider>
    </QC>,
  );
}

describe('ViolationsPage with a scope', () => {
  it('shows the scope\'s findings as one page, dismissable today', async () => {
    const onDismissFinding = vi.fn();
    renderPage({ callbacks: { onDismissFinding } });
    expect(await screen.findByRole('option', { name: /Today finding/ })).toBeInTheDocument();
    expect(screen.queryByText(t('violations.termName'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismissFinding).toHaveBeenCalledWith(expect.objectContaining({ title: 'Today finding' }), 'run-1');
  });

  it('as of a past day it reads that day, read-only, its header saying so with the way back', async () => {
    const onBackToToday = vi.fn();
    renderPage({ asOf: { runId: 'run-7', day: '2026-08-07' }, callbacks: { onDismissFinding: vi.fn(), onBackToToday } });
    expect(await screen.findByRole('option', { name: /Past finding/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('violations.asOfBack') })).toBeNull();
    expect(document.querySelector('.findings-head__past')).toHaveTextContent(t('violations.headPast', { when: '2026-08-07' }));
    fireEvent.click(screen.getByRole('button', { name: t('violations.headBackToLatest') }));
    expect(onBackToToday).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });
});
