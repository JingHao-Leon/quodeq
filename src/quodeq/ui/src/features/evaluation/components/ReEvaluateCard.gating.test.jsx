import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { invalidateDimensionCache } from '../hooks/usePluginDimensions.js';
import { makeFakeApi, renderCard } from './_reEvaluateCard.fixtures.jsx';

/**
 * Split from ReEvaluateCard.test.jsx: ephemeral gating, clean-scan once
 * consumption, and the getProjectInfo error state.
 */

// Scan stays disabled until a model is chosen; the gating tests below are
// about other blockers, so they run with one.
function chooseModel() {
  localStorage.setItem('cc-active-provider', 'claude');
  localStorage.setItem('cc-claude-model', 'opus');
}

describe('ReEvaluateCard ephemeral gating', () => {
  beforeEach(() => {
    invalidateDimensionCache();
    chooseModel();
  });

  it('disables re-evaluation when projectInfo.evaluable is false (ephemeral completed)', async () => {
    const projectInfo = {
      name: 'demo',
      path: '/tmp/cloned/repo',
      location: 'local',
      ephemeral: true,
      evaluable: false,
    };
    const api = makeFakeApi({ getProjectInfo: vi.fn().mockResolvedValue(projectInfo) });
    renderCard({ project: 'uuid-1', projectInfo, api });

    // The explanatory note appears
    await waitFor(() => {
      expect(
        screen.getByText(/ephemeral|working copy was deleted|one-shot/i),
      ).toBeInTheDocument();
    });

    // The scan button should be disabled
    const button = screen.getByRole('button', { name: /^▸\s*scan$|^scan$|running\.\.\./i });
    expect(button).toBeDisabled();
  });

  it('keeps re-evaluation enabled for normal local projects', async () => {
    const projectInfo = {
      name: 'demo',
      path: '/repos/myproj',
      location: 'local',
      ephemeral: false,
      evaluable: true,
    };
    const api = makeFakeApi({
      getProjectInfo: vi.fn().mockResolvedValue(projectInfo),
      listStandards: vi.fn().mockResolvedValue([]),
    });
    renderCard({ project: 'uuid-2', projectInfo, api });

    // Wait for info to render (the identity strip's scope cell)
    await waitFor(() => {
      expect(screen.getByText('whole project')).toBeInTheDocument();
    });

    // No ephemeral note
    expect(
      screen.queryByText(/working copy was deleted|one-shot/i),
    ).not.toBeInTheDocument();

    // Scan button is not disabled
    const button = screen.getByRole('button', { name: /^▸\s*scan$|^scan$|running\.\.\./i });
    expect(button).not.toBeDisabled();
  });
});

describe('ReEvaluateCard clean-scan once consumption', () => {
  beforeEach(() => { invalidateDimensionCache(); chooseModel(); });

  const localInfo = { name: 'demo', path: '/repos/myproj', location: 'local', ephemeral: false, evaluable: true };
  const apiWithDims = () => makeFakeApi({
    getProjectInfo: vi.fn().mockResolvedValue(localInfo),
    listPlugins: vi.fn().mockResolvedValue([{ dimensions: [
      { id: 'security', label: 'Security' },
    ] }]),
  });

  async function armOnceToggle(user) {
    await user.click(screen.getByRole('radio', { name: /clean scan/i }));
    expect(screen.getByRole('radio', { name: /clean scan/i })).toBeChecked();
    // Picking the clean card defaults to one-shot; the sub-choice reflects it.
    expect(screen.getByRole('button', { name: /this scan only/i })).toHaveAttribute('aria-pressed', 'true');
  }

  it('keeps the once toggle armed when the start is blocked', async () => {
    // Regression (v1.6.0): a start swallowed by the running-job guard still
    // consumed the one-shot clean toggle, so the user's retry silently ran
    // incremental and counted a discarded run's files as analyzed.
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onStart = vi.fn().mockReturnValue(false);
    renderCard({ project: 'p-once', projectInfo: localInfo, api: apiWithDims(), onStart, preselectDims: ['security'] });
    await waitFor(() => expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute('aria-pressed', 'true'));

    await armOnceToggle(user);
    await user.click(screen.getByRole('button', { name: /^▸\s*scan$|^scan$/i }));

    expect(onStart).toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /clean scan/i })).toBeChecked();
  });

  it('consumes the once toggle when the start goes through', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onStart = vi.fn().mockResolvedValue({ jobId: 'j1' });
    renderCard({ project: 'p-once2', projectInfo: localInfo, api: apiWithDims(), onStart, preselectDims: ['security'] });
    await waitFor(() => expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute('aria-pressed', 'true'));

    await armOnceToggle(user);
    await user.click(screen.getByRole('button', { name: /^▸\s*scan$|^scan$/i }));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /clean scan/i })).not.toBeChecked();
      expect(screen.getByRole('radio', { name: /incremental/i })).toBeChecked();
    });
  });
});

describe('ReEvaluateCard error state', () => {
  beforeEach(() => { invalidateDimensionCache(); });

  it('renders visible error UI instead of vanishing when getProjectInfo rejects', async () => {
    const api = makeFakeApi({ getProjectInfo: vi.fn().mockRejectedValue(new Error('boom')) });
    renderCard({ project: 'uuid-err', projectInfo: null, api });

    // apiErrorMessage prefers the real backend sentence over the generic
    // fallback, same policy as every other error site in this file
    // (handleUrlRestore) and in useEvaluationMutations.
    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('falls back to the generic message when the failure carries no text', async () => {
    const api = makeFakeApi({ getProjectInfo: vi.fn().mockRejectedValue(new Error('')) });
    renderCard({ project: 'uuid-err-empty', projectInfo: null, api });

    await waitFor(() => {
      expect(screen.getByText(/could not load project info/i)).toBeInTheDocument();
    });
  });

  it('logs the real error to console on a failed info load', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    const api = makeFakeApi({ getProjectInfo: vi.fn().mockRejectedValue(err) });
    renderCard({ project: 'uuid-log', projectInfo: null, api });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/project info/i), err);
    });
    errorSpy.mockRestore();
  });

  it('retry re-invokes the info load', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const getProjectInfo = vi.fn().mockRejectedValue(new Error('boom'));
    const api = makeFakeApi({ getProjectInfo });
    renderCard({ project: 'uuid-retry', projectInfo: null, api });

    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument();
    });
    expect(getProjectInfo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(getProjectInfo).toHaveBeenCalledTimes(2);
    });
  });

});

describe('ReEvaluateCard first-run defaults', () => {
  beforeEach(() => {
    invalidateDimensionCache();
    localStorage.clear();
    // A CLI provider whose Settings cap is 10 minutes: a first run ignores it.
    localStorage.setItem('cc-active-provider', 'claude');
    localStorage.setItem('cc-claude-time-limit', '600');
  });

  const firstRunInfo = { name: 'demo', path: '/repos/myproj', location: 'local', ephemeral: false, evaluable: true, runsCount: 0, latestRunId: null };
  const apiWithTwoDims = () => makeFakeApi({
    getProjectInfo: vi.fn().mockResolvedValue({ ...firstRunInfo, runsCount: 0 }),
    listPlugins: vi.fn().mockResolvedValue([{ dimensions: [
      { id: 'security', label: 'Security' },
      { id: 'maintainability', label: 'Maintainability' },
    ] }]),
  });

  it('first run selects every dimension with the neutral checked style', async () => {
    renderCard({ project: 'p-first', projectInfo: firstRunInfo, api: apiWithTwoDims() });
    await waitFor(() => expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute('aria-pressed', 'true'));
    const maint = screen.getByRole('button', { name: /maintainability/i });
    expect(maint).toHaveAttribute('aria-pressed', 'true');
    expect(maint).toHaveClass('eval-dim-card--neutral');
  });

  it('a project with runs starts with none selected and the usual style', async () => {
    renderCard({ project: 'p-ran', projectInfo: { ...firstRunInfo, runsCount: 3, latestRunId: 'r3' }, api: apiWithTwoDims() });
    await waitFor(() => expect(screen.getByRole('button', { name: /security/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /security/i })).not.toHaveClass('eval-dim-card--neutral');
  });

  it('first run budget is no limit', async () => {
    renderCard({ project: 'p-first-budget', projectInfo: firstRunInfo, api: apiWithTwoDims() });
    await waitFor(() => expect(screen.getByText(/2 dimensions · no time limit/)).toBeInTheDocument());
  });

  it('scope cell reads whole project without the absolute path', async () => {
    renderCard({ project: 'p-first-scope', projectInfo: firstRunInfo, api: apiWithTwoDims() });
    const scopeCode = await screen.findByText('whole project');
    expect(scopeCode).toHaveTextContent(/^whole project$/);
    expect(screen.queryByText(/\/repos\/myproj/)).not.toBeInTheDocument();
    expect(scopeCode.closest('[title]')).toHaveAttribute('title', expect.stringContaining('/repos/myproj'));
  });

  it('an active provider with no model keeps scan disabled and asks for one', async () => {
    localStorage.clear();
    localStorage.setItem('cc-active-provider', 'ollama');
    renderCard({ project: 'p-first-emptymodel', projectInfo: firstRunInfo, api: apiWithTwoDims() });
    await waitFor(() => expect(screen.getByText('pick a model to start')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^▸\s*scan|^scan/i })).toBeDisabled();
  });

  it('scan is disabled and names the missing model', async () => {
    localStorage.clear();
    renderCard({ project: 'p-first-nomodel', projectInfo: firstRunInfo, api: apiWithTwoDims() });
    await waitFor(() => expect(screen.getByText('pick a model to start')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^▸\s*scan|^scan/i })).toBeDisabled();
  });

  it('an entry that arrives after mount still applies both first-run defaults', async () => {
    const { rerenderCard } = renderCard({ project: 'p-late', projectInfo: undefined, api: apiWithTwoDims() });
    await waitFor(() => expect(screen.getByRole('button', { name: /security/i })).toBeInTheDocument());
    rerenderCard({ projectInfo: firstRunInfo });
    await waitFor(() => expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: /maintainability/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/2 dimensions · no time limit/)).toBeInTheDocument();
  });

  it('toggles made after the first-run seed survive a re-render', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const { rerenderCard } = renderCard({ project: 'p-toggle', projectInfo: firstRunInfo, api: apiWithTwoDims() });
    await waitFor(() => expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute('aria-pressed', 'true'));
    await user.click(screen.getByRole('button', { name: /security/i }));
    rerenderCard({ projectInfo: { ...firstRunInfo } });
    expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /maintainability/i })).toHaveAttribute('aria-pressed', 'true');
  });
});


describe('ReEvaluateCard with a folder that is not on this computer', () => {
  beforeEach(() => {
    invalidateDimensionCache();
    chooseModel();
  });

  it('asks where the code is and keeps scan disabled until it is found', async () => {
    const missing = { name: 'site', path: '/Users/publisher/site', location: 'local', pathExists: false, originUrl: 'https://github.com/org/site' };
    const found = { ...missing, path: 'https://github.com/org/site', location: 'online', pathExists: null };
    const getProjectInfo = vi.fn().mockResolvedValueOnce(missing).mockResolvedValue(found);
    const api = makeFakeApi({ getProjectInfo });
    renderCard({ project: 'uuid-pulled', projectInfo: missing, api });

    expect(await screen.findByRole('region', { name: "find this project's code" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^▸\s*scan$|^scan$/i })).toBeDisabled();

    screen.getByRole('button', { name: 'clone it instead' }).click();
    await waitFor(() => expect(api.relocateProject).toHaveBeenCalledWith('uuid-pulled', 'https://github.com/org/site'));
    await waitFor(() => expect(screen.queryByRole('region', { name: "find this project's code" })).not.toBeInTheDocument());
  });
});
