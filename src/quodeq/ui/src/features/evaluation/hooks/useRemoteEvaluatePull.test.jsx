import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRemoteEvaluatePull } from './useRemoteEvaluatePull.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';

const showToast = vi.fn();
vi.mock('../../side-pane/SidePaneContext.jsx', () => ({
  useSidePane: () => ({ showToast }),
}));

const idle = { state: 'idle', phase: null };
const running = { state: 'running', phase: 'downloading', project: 'remote-1' };
const done = { state: 'done', phase: 'done', project: 'remote-1', projectId: 'local-1', projectName: 'site', finishedAt: 5 };
const collided = {
  state: 'error', phase: 'error', project: 'remote-1', code: 'PROJECT_EXISTS', error: 'exists',
  conflictKind: 'same_identity', existingProjectId: 'mine', finishedAt: 7,
};
const failed = { state: 'error', phase: 'error', project: 'remote-1', projectName: 'site', code: 'X', error: 'boom', finishedAt: 6 };
const POLL_WAIT = { timeout: 3000 };

// The status the fake server answers; a test moves it along like the job would.
function setup({ activeTab = 'evaluate', projects = [] } = {}) {
  const status = { current: { configured: true, pull: idle } };
  const api = {
    getSyncStatus: vi.fn(async () => status.current),
    startPull: vi.fn(async () => { status.current = { configured: true, pull: running }; return { started: true }; }),
    connectShared: vi.fn(),
  };
  const handleProjectChange = vi.fn();
  const navTab = vi.fn();
  const stateFor = (list) => ({ selectedSource: 'shared', selectedProject: 'remote-1', projects: list, handleProjectChange });
  const hook = renderHook(
    ({ list, tab }) => useRemoteEvaluatePull({ state: stateFor(list), activeTab: tab, navTab }),
    { wrapper: withStableQueryApi(api), initialProps: { list: projects, tab: activeTab } },
  );
  return { ...hook, api, status, handleProjectChange, navTab };
}

async function startAndFinish(ctx, outcome) {
  await waitFor(() => expect(ctx.api.getSyncStatus).toHaveBeenCalled());
  await act(async () => { ctx.result.current.start('remote-1'); });
  await waitFor(() => expect(ctx.result.current.pullingId).toBe('remote-1'));
  ctx.status.current = { configured: true, pull: outcome };
  await waitFor(() => expect(ctx.result.current.pullingId).toBeNull(), POLL_WAIT);
}

describe('useRemoteEvaluatePull', () => {
  beforeEach(() => { showToast.mockClear(); });

  it('on the card, selects the local copy once it is in the projects list and starts no run', async () => {
    const ctx = setup();
    await startAndFinish(ctx, done);
    expect(ctx.api.startPull).toHaveBeenCalledWith('remote-1', undefined);
    // The list has not caught up yet: nothing switches (Evaluate would bounce).
    expect(ctx.handleProjectChange).not.toHaveBeenCalled();

    ctx.rerender({ list: [{ id: 'local-1' }], tab: 'evaluate' });

    expect(ctx.handleProjectChange).toHaveBeenCalledWith('local-1', 'local');
    expect(ctx.navTab).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('off the card, leaves the page alone and offers evaluate in a toast', async () => {
    const ctx = setup();
    await startAndFinish(ctx, done);
    ctx.rerender({ list: [{ id: 'local-1' }], tab: 'violations' });

    expect(ctx.handleProjectChange).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
    const [message, action] = showToast.mock.calls[0];
    expect(message).toBe('local copy of site is ready');
    expect(action.label).toBe('evaluate');

    action.onClick();
    expect(ctx.handleProjectChange).toHaveBeenCalledWith('local-1', 'local');
    expect(ctx.navTab).toHaveBeenCalledWith('evaluate');
  });

  it('a failure on the card is left to the card; off it, it is toasted', async () => {
    const onCard = setup();
    await startAndFinish(onCard, failed);
    expect(onCard.result.current.pullError).toEqual({ projectId: 'remote-1', message: expect.any(String) });
    expect(showToast).not.toHaveBeenCalled();

    const offCard = setup({ activeTab: 'map' });
    await startAndFinish(offCard, failed);
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(showToast.mock.calls[0][0]).toMatch(/^couldn't pull site · /);
  });

  it('a collision names the local project already here and evaluates it instead of pulling', async () => {
    const ctx = setup({ projects: [{ id: 'mine' }] });
    await startAndFinish(ctx, collided);
    await waitFor(() => expect(ctx.result.current.pullConflictId).toBe('remote-1'));
    expect(ctx.result.current.pullConflictExistingId).toBe('mine');

    act(() => { ctx.result.current.openExisting('remote-1'); });

    expect(ctx.handleProjectChange).toHaveBeenCalledWith('mine', 'local');
    expect(ctx.result.current.pullConflictId).toBeNull();
    expect(ctx.api.startPull).toHaveBeenCalledTimes(1);
  });

  it('does not offer a colliding project that is not in the projects list', async () => {
    const ctx = setup({ projects: [] });
    await startAndFinish(ctx, collided);
    await waitFor(() => expect(ctx.result.current.pullConflictId).toBe('remote-1'));
    expect(ctx.result.current.pullConflictExistingId).toBeNull();
  });
});
