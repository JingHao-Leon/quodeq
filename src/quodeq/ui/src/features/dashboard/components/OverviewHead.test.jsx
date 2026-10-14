import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import OverviewHead from './OverviewHead.jsx';
import { scopeMetrics } from '../../../models/findingMetrics.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';

const DIMS = [{ dimension: 'security', filesRead: 100, sourceFileCount: 100 }, { dimension: 'reliability', filesRead: 100, sourceFileCount: 100 }];
const ACC = { summary: { numericAverage: 7.4, totalViolations: 20, totalCompliance: 80, severity: { critical: 2, major: 8, minor: 10 } }, dimensions: DIMS };
const STATS = { scoreDelta: '0.6', lastRun: { date: '14 Oct 2026', runId: 'r2' } };
const HEADLINE = { filesRead: 200 };

function renderHead({ data = {}, stats = STATS, previous = null, pastRun = null, api = {} } = {}) {
  const fullApi = { getRunLog: vi.fn(async () => ({ runs: [{ runId: 'r2', status: 'done', model: 'qwen' }] })), ...api };
  const props = { data: { selectedProject: 'p', selectedSource: 'local', projectInfo: { name: 'proj', filesCount: 61 }, ...data }, accumulated: ACC, stats, headline: HEADLINE };
  render(<OverviewHead {...props} previous={previous} pastRun={pastRun} />, { wrapper: withStableQueryApi(fullApi) });
  return fullApi;
}

describe('OverviewHead', () => {
  it('names the project, its make-up, when and by which model it was evaluated', async () => {
    renderHead();
    expect(document.querySelector('.findings-head .term-header__name')).toHaveTextContent('proj');
    await waitFor(() => expect(screen.getByText('61 files · evaluated 14 Oct 2026 · by qwen')).toBeInTheDocument());
  });

  it('warns about coverage only when a dimension read part of the files', () => {
    renderHead({ data: { projectInfo: null }, stats: { ...STATS, lastRun: {} } });
    expect(screen.queryByText(/read only part of the files/)).not.toBeInTheDocument();
  });

  it('shows the per 100 files tile averaged over the dimensions, and the trend from 0.05 up', () => {
    renderHead();
    expect(screen.getByText('averaged over 2 dimensions')).toBeInTheDocument();
    expect(screen.getByText('+0.6')).toBeInTheDocument();
  });

  it('hides a trend under 0.05', () => {
    renderHead({ stats: { ...STATS, scoreDelta: '0.0' } });
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });

  it('marks a shared project and a custom formula, and asks no run log for a shared one', () => {
    const api = renderHead({ data: { selectedSource: 'shared', customFormula: true, projectInfo: { publishedBy: 'alice' } } });
    expect(screen.getByText('remote · read-only')).toBeInTheDocument();
    expect(screen.getByText('published by alice')).toBeInTheDocument();
    expect(screen.getByText(/custom formula/i)).toBeInTheDocument();
    expect(api.getRunLog).not.toHaveBeenCalled();
  });

  it('shows each tile\'s change since the previous period', () => {
    renderHead({ previous: scopeMetrics({ sevCounts: { critical: 1, major: 8, minor: 11 }, total: 20, compliance: 60, files: 200 }) });
    // Pass rate 80% now, 75% before: five points up.
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('on an older run, says which and goes back to the latest', () => {
    const onBack = vi.fn();
    renderHead({ pastRun: { when: '2026-10-01', onBack } });
    expect(screen.getByText(/Viewing 2026-10-01/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to latest/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
