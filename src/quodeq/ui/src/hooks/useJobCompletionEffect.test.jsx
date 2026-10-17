import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { projectsKeys } from '../api/queryKeys.js';
import { useJobCompletionEffect } from './useJobCompletionEffect.js';
import { JOB_STATUS } from '../vocab/jobStatus.js';
import { NAV_TAB } from '../vocab/navTab.js';

const PROJECTS_LIST = { queryKey: projectsKeys.list() };

function renderEffect(job) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const props = { job, navTab: vi.fn(), queryClient, selectedProject: null, selectProjectAndRun: vi.fn() };
  const utils = renderHook((p) => useJobCompletionEffect(p), { initialProps: props });
  return { ...utils, invalidate, props };
}

describe('useJobCompletionEffect project-list refresh', () => {
  it('invalidates the project list when a job finishes with a run', () => {
    const { invalidate } = renderEffect({ status: JOB_STATUS.DONE, outputProject: 'p1', outputRunId: 'r1' });
    expect(invalidate).toHaveBeenCalledWith(PROJECTS_LIST);
  });

  it('does not invalidate the project list while the job is still running', () => {
    const { invalidate } = renderEffect({ status: JOB_STATUS.RUNNING, outputProject: 'p1', outputRunId: 'r1' });
    expect(invalidate).not.toHaveBeenCalledWith(PROJECTS_LIST);
  });

  it('invalidates once per finished run, not on every re-render', () => {
    const job = { status: JOB_STATUS.DONE, outputProject: 'p1', outputRunId: 'r1' };
    const { invalidate, rerender, props } = renderEffect(job);
    rerender({ ...props, job: { ...job } });
    const listCalls = invalidate.mock.calls.filter(([arg]) => JSON.stringify(arg) === JSON.stringify(PROJECTS_LIST));
    expect(listCalls).toHaveLength(1);
  });
});

describe('useJobCompletionEffect and runs the app did not start', () => {
  it('an adopted external run does not move the user to Evaluate', () => {
    const { props } = renderEffect({ status: JOB_STATUS.RUNNING, source: 'external' });
    expect(props.navTab).not.toHaveBeenCalled();
  });

  it('a run the app started still opens Evaluate', () => {
    const { props } = renderEffect({ status: JOB_STATUS.RUNNING, source: 'internal' });
    expect(props.navTab).toHaveBeenCalled();
  });

  it('a finished external run does not change an empty selection', () => {
    const { props } = renderEffect({ status: JOB_STATUS.DONE, source: 'external', outputProject: 'pr-tmp', outputRunId: 'r1' });
    expect(props.selectProjectAndRun).not.toHaveBeenCalled();
  });

  it('a finished external run on the selected project still selects its run', () => {
    const queryClient = new QueryClient();
    const props = { job: { status: JOB_STATUS.DONE, source: 'external', outputProject: 'p1', outputRunId: 'r1' }, navTab: vi.fn(), queryClient, selectedProject: 'p1', selectProjectAndRun: vi.fn() };
    renderHook((p) => useJobCompletionEffect(p), { initialProps: props });
    expect(props.selectProjectAndRun).toHaveBeenCalledWith('p1', 'r1');
  });
});

describe('useJobCompletionEffect after a first evaluation', () => {
  const RUNNING = { status: JOB_STATUS.RUNNING, outputProject: 'p1', outputRunId: null };
  const DONE = { status: JOB_STATUS.DONE, outputProject: 'p1', outputRunId: 'r1' };

  // Starts the job with `list` in the projects cache, then finishes it.
  function runToCompletion(list, activeTab = NAV_TAB.EVALUATE) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(projectsKeys.list(), list);
    const props = { job: RUNNING, navTab: vi.fn(), activeTab, queryClient, selectedProject: 'p1', selectProjectAndRun: vi.fn() };
    const { rerender } = renderHook((p) => useJobCompletionEffect(p), { initialProps: props });
    // The list refetches mid-run and already counts the running run.
    queryClient.setQueryData(projectsKeys.list(), [{ name: 'p1', runsCount: (list[0]?.runsCount ?? 0) + 1, latestRunId: 'r1' }]);
    rerender({ ...props, job: DONE });
    return props;
  }

  it('first finished run moves Evaluate to Overview', () => {
    const props = runToCompletion([{ name: 'p1', runsCount: 0, latestRunId: null }]);
    expect(props.selectProjectAndRun).toHaveBeenCalledWith('p1', 'r1');
    expect(props.navTab).toHaveBeenLastCalledWith(NAV_TAB.OVERVIEW);
  });

  it('a project added just before the start counts as first when its only run is this one', () => {
    const props = runToCompletion([]);
    expect(props.navTab).toHaveBeenLastCalledWith(NAV_TAB.OVERVIEW);
  });

  it('later runs stay on Evaluate', () => {
    const props = runToCompletion([{ name: 'p1', runsCount: 3, latestRunId: 'r0' }]);
    expect(props.navTab).not.toHaveBeenCalledWith(NAV_TAB.OVERVIEW);
  });

  it('a first run finishing while the user is elsewhere does not move them', () => {
    const props = runToCompletion([{ name: 'p1', runsCount: 0, latestRunId: null }], NAV_TAB.HISTORY);
    expect(props.navTab).not.toHaveBeenCalledWith(NAV_TAB.OVERVIEW);
  });

  it('an external first run never navigates', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(projectsKeys.list(), [{ name: 'p1', runsCount: 0, latestRunId: null }]);
    const props = { job: { ...DONE, source: 'external' }, navTab: vi.fn(), activeTab: NAV_TAB.EVALUATE, queryClient, selectedProject: 'p1', selectProjectAndRun: vi.fn() };
    renderHook((p) => useJobCompletionEffect(p), { initialProps: props });
    expect(props.navTab).not.toHaveBeenCalled();
  });
});
