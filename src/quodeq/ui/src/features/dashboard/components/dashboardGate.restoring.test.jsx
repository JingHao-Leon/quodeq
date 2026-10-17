import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { renderDashboardGate } from './dashboardGate.jsx';
import { renderDashboardBody } from './dashboardBody.jsx';

// Opening an archived run restores it first (a few seconds the first time),
// so the run page's waiting states say so instead of the plain loading line.

const RESTORING = 'restoring archived run…';
const PAGE_STATE = { dashboardAppearClass: '', showNoRunsEmpty: false, contentReady: false, isLoading: true, showOverviewSkeleton: false };

function gate(archivedRun) {
  const data = { projects: [{ id: 'p1' }], selectedSource: 'local', selectedProject: 'p1', dashboard: null, loading: false, error: null, isFetching: true };
  return renderDashboardGate({ data, callbacks: {}, runMode: true, projectName: 'p1', projectInfo: null, pageState: PAGE_STATE, archivedRun });
}

function body(archivedRun) {
  const data = { dashboard: null, error: null, isFetching: true, selectedProject: 'p1' };
  return renderDashboardBody({ data, callbacks: {}, runMode: true, projectName: 'p1', projectInfo: null, pageState: PAGE_STATE, archivedRun });
}

describe('run page while an archived run opens', () => {
  it('the refetch gate says it is restoring the archived run', () => {
    const { container } = render(gate(true));
    expect(container.querySelector('.loading-message')).toHaveTextContent(RESTORING);
  });

  it('the refetch gate keeps the project loading line for a run that is not archived', () => {
    const { container } = render(gate(false));
    expect(container.querySelector('.loading-message')).toHaveTextContent('Loading p1…');
  });

  it("the run skeleton's sub line says it is restoring the archived run", () => {
    const { container } = render(body(true));
    expect(container.querySelector('.term-header__sub')).toHaveTextContent(RESTORING);
  });

  it("the run skeleton's sub line names the project for a run that is not archived", () => {
    const { container } = render(body(false));
    expect(container.querySelector('.term-header__sub')).toHaveTextContent('loading p1');
  });
});
