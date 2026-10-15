import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import OverviewHead, { languageSub, overviewSub } from './OverviewHead.jsx';
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
    expect(screen.getByText('2026-10-01')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to latest/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('the Overview\'s sub line', () => {
  const dim = (over = {}) => ({ dimension: 'a', filesRead: 100, sourceFileCount: 100, ...over });

  it('reads the project\'s size, then its top languages', () => {
    expect(languageSub({ filesCount: 3925, languageStats: { py: 2329, jsx: 866 } })).toBe('3,925 files  ·  2329 python  866 jsx');
    expect(languageSub(null)).toBeNull();
  });

  it('reads files and languages, when, by which model, then the coverage warning', () => {
    const sub = overviewSub({ projectInfo: { filesCount: 61 }, lastDate: '14 Oct 2026', model: 'qwen', dimensions: [dim({ filesRead: 50 })] });
    expect(sub).toBe('61 files · evaluated 14 Oct 2026 · by qwen · 1 dimension read only part of the files');
  });

  it('warns about nothing when every dimension read its files, and shows nothing unknown', () => {
    expect(overviewSub({ projectInfo: null, lastDate: '14 Oct 2026', dimensions: [dim(), dim({ dimension: 'b' })] })).toBe('evaluated 14 Oct 2026');
    expect(overviewSub({ projectInfo: null })).toBeNull();
  });

  it('a shared project says when its copy was last fetched', () => {
    const lastFetchedAt = new Date().toISOString();
    expect(overviewSub({ projectInfo: { lastFetchedAt }, lastDate: '14 Oct 2026' })).toMatch(/^evaluated 14 Oct 2026 · fetched /);
  });
});
