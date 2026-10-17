import { describe, it, expect, vi } from 'vitest';
import { makeTryResumeExisting, resumedExisting } from './resumeExisting.js';

describe('makeTryResumeExisting', () => {
  it('resumes a registered project with no evaluations into its scan', async () => {
    const actions = { succeedScan: vi.fn() };
    const getProjectScan = vi.fn(async () => ({ total_files: 3 }));
    const tryResume = makeTryResumeExisting({ getProjectInfo: async () => ({ runsCount: 0, path: '/u/me/p1' }), getProjectScan, actions });
    expect(await tryResume('p1')).toEqual({ hasRuns: false });
    expect(actions.succeedScan).toHaveBeenCalledWith('p1', { total_files: 3 }, '/u/me/p1');
  });

  it('resumes a project that already has evaluations and says so', async () => {
    const actions = { succeedScan: vi.fn() };
    const getProjectScan = vi.fn(async () => ({ total_files: 3 }));
    const tryResume = makeTryResumeExisting({ getProjectInfo: async () => ({ runsCount: 2, path: '/u/me/p1' }), getProjectScan, actions });
    expect(await tryResume('p1')).toEqual({ hasRuns: true });
    expect(actions.succeedScan).toHaveBeenCalledWith('p1', { total_files: 3 }, '/u/me/p1');
  });

  it('a failing read falls back to the error path', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const tryResume = makeTryResumeExisting({
        getProjectInfo: async () => { throw new Error('boom'); }, getProjectScan: vi.fn(), actions: { succeedScan: vi.fn() },
      });
      expect(await tryResume('p1')).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('resumedExisting', () => {
  it('anything but a 409 carrying the existing project id does not resume', async () => {
    const tryResume = vi.fn(async () => ({ hasRuns: false }));
    expect(await resumedExisting({ status: 500, existingProjectId: 'p1' }, tryResume)).toBeNull();
    expect(await resumedExisting({ status: 409 }, tryResume)).toBeNull();
    expect(tryResume).not.toHaveBeenCalled();
  });

  it('a 409 carrying the existing project id resumes it', async () => {
    const tryResume = vi.fn(async () => ({ hasRuns: false }));
    expect(await resumedExisting({ status: 409, existingProjectId: 'p1' }, tryResume)).toEqual({ hasRuns: false });
    expect(tryResume).toHaveBeenCalledWith('p1');
  });
});
