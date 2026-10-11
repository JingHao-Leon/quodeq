import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LiveViolationsFeed from './LiveViolationsFeed.jsx';
import { evaluationKeys } from '../../../api/queryKeys.js';
import { getEvaluationProgress } from '../../../api/index.js';

vi.mock('../../../api/index.js', () => ({ getEvaluationProgress: vi.fn() }));

const job = { jobId: 'job-1', status: 'running', outputRunId: 'run-9', outputProject: 'proj-1' };
const v = (dim) => ({ dimension: dim, severity: 'major', title: 't', file: 'a.py', line: 1, principle: 'P' });
const progress = { dimensions: [
  { id: 'security', state: 'done', files: { taken: 3, total: 3 } },
  { id: 'reliability', state: 'done', files: { taken: 3, total: 3 } },
  { id: 'performance', state: 'running', files: { taken: 1, total: 3 } },
] };

function renderFeed({ seed, onOpen = vi.fn(), j = job }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(evaluationKeys.dimensions('job-1'), seed);
  render(
    <QueryClientProvider client={client}>
      <LiveViolationsFeed job={j} liveViolations={{ security: [v('security')], performance: [v('performance')] }} onOpenDimension={onOpen} />
    </QueryClientProvider>,
  );
  return onOpen;
}

describe('finished dimensions in the live list', () => {
  beforeEach(() => { getEvaluationProgress.mockReset(); getEvaluationProgress.mockResolvedValue(progress); });

  it('a done dimension with findings shows its grade and score and opens its results', async () => {
    const onOpen = renderFeed({ seed: { security: { overallScore: '8.4/10', overallGrade: 'Good' } } });
    expect(await screen.findByText('8.4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'open security results' }));
    expect(onOpen).toHaveBeenCalledWith({ dimension: 'security', runId: 'run-9', fromProject: 'proj-1' });
  });

  it('a done dimension without new findings still gets a row with its score', async () => {
    renderFeed({ seed: { reliability: { overallScore: 7.4, overallGrade: 'Good' } } });
    expect(await screen.findByText('7.4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'open reliability results' })).toBeInTheDocument();
  });

  it('a dimension still running, or whose frame has not arrived, shows no score and no link', async () => {
    renderFeed({ seed: {} });
    await screen.findByText('performance');
    expect(screen.queryByRole('button', { name: /results$/ })).toBeNull();
    expect(screen.queryByText('NaN')).toBeNull();
  });

  it('no run id yet: the score shows, the link does not', async () => {
    renderFeed({ seed: { security: { overallScore: '8.4/10' } }, j: { ...job, outputRunId: null } });
    expect(await screen.findByText('8.4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'open security results' })).toBeNull();
  });
});
