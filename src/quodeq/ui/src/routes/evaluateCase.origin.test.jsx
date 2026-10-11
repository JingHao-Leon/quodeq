import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';

// A PR review is filed under a throwaway project in CI; the Evaluate route
// resolves it to the known project with the same git origin.
const job = { jobId: 'ext-pr', status: 'running', source: 'external', outputProject: 'tmp-uuid', originUrl: 'https://github.com/quodeq/quodeq' };

let screenActions = null;

vi.mock('../features/evaluation/EvaluationLiveContext.jsx', () => ({
  useLiveJob: () => job,
  useLiveJobError: () => null,
  useLiveFindings: () => ({}),
  useLiveStartedProject: () => null,
  useEvaluationActions: () => ({}),
}));

vi.mock('../features/evaluation/components/EvaluateScreen.jsx', () => ({
  default: ({ context, actions }) => {
    screenActions = actions;
    return <span>{context.jobProjectInfo?.name ?? 'none'}</span>;
  },
}));

const { EvaluateCase } = await import('./routeCases.jsx');

describe('the Evaluate route and an external run', () => {
  it('names the project that shares the run\'s git origin', async () => {
    const projects = [{ id: 'p1', name: 'quodeq', originUrl: 'git@github.com:quodeq/quodeq.git' }];
    render(<Suspense fallback={null}><EvaluateCase selectedProject={null} projects={projects} /></Suspense>);
    expect(await screen.findByText('quodeq')).toBeInTheDocument();
  });

  it('passes an onOpenDimension action to the screen', async () => {
    const onOpenDimension = vi.fn();
    render(<Suspense fallback={null}><EvaluateCase selectedProject={null} projects={[]} onOpenDimension={onOpenDimension} /></Suspense>);
    await screen.findByText('none');
    screenActions.onOpenDimension({ dimension: 'security', runId: 'run-9', fromProject: 'p1' });
    expect(onOpenDimension).toHaveBeenCalledWith({ dimension: 'security', runId: 'run-9', fromProject: 'p1' });
  });
});
