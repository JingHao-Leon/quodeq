import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EvaluationStatus from './EvaluationStatus.jsx';
import { evaluationKeys } from '../../../api/queryKeys.js';

// ScanProgress needs EvalLogContext and the strip is not under test; the
// real EvaluationStatus -> LiveViolationsFeed wiring is.
vi.mock('./ScanProgress.jsx', () => ({ default: () => null }));
vi.mock('./JobStatStrip.jsx', () => ({ default: () => null }));
vi.mock('../../../api/index.js', () => ({
  getEvaluationProgress: vi.fn().mockResolvedValue({
    dimensions: [{ id: 'security', state: 'done', files: { taken: 3, total: 3 } }],
  }),
}));

const job = { jobId: 'job-1', status: 'running', outputRunId: 'run-9', outputProject: 'proj-1' };
const finding = { dimension: 'security', severity: 'major', title: 't', file: 'a.py', line: 1, principle: 'P' };

describe('EvaluationStatus results link', () => {
  it('passes onOpenDimension through to the live feed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(evaluationKeys.dimensions('job-1'), { security: { overallScore: '8.4/10' } });
    const onOpenDimension = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <EvaluationStatus job={job} liveViolations={{ security: [finding] }} onOpenDimension={onOpenDimension} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'open security results' }));
    expect(onOpenDimension).toHaveBeenCalledWith({ dimension: 'security', runId: 'run-9', fromProject: 'proj-1' });
  });
});
