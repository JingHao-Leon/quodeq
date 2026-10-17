import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { withQueryClient } from '../../test-utils/withQueryClient.jsx';
import { useWizardLifecycle } from './useWizardLifecycle.js';
import { SKIPPED_KEY, SKIPPED_VALUE, STEP_WELCOME, STEP_ANALYZE } from './wizardSteps.js';
import { PROJECT_SOURCE } from '../../vocab/projectSource.js';
import { NAV_TAB } from '../../vocab/navTab.js';
import { WIZARD_SOURCE } from './onboardingVocab.js';
import { QueryClient } from '@tanstack/react-query';
import { projectsKeys } from '../../api/queryKeys.js';
import { useJobCompletionEffect } from '../../hooks/useJobCompletionEffect.js';
import { JOB_STATUS } from '../../vocab/jobStatus.js';

// The auto-open is derived from its inputs rather than decided once: it is
// re-evaluated whenever the project list or the shared signal changes, never
// opens while either is still resolving or once the user opted out, and a
// welcome-step wizard steps aside on its own when shared content shows up
// (a team repo connected mid-session gives the user something to look at).

const NOTHING = { settled: true, hasContent: false };
const UNSETTLED = { settled: false, hasContent: false };
const SHARED_CONTENT = { settled: true, hasContent: true };

// The server's instance id (the state folder's identity) as the health poll
// reports it: the skip flag is keyed on it.
const INSTANCE = 'inst-1';

function props(opts) {
  const { projects = [], projectsLoaded = true, sharedSignal = NOTHING, isEvaluating = false } = opts;
  // An explicit undefined means "the poll has not answered yet", so the
  // default is applied by key presence, not by a destructuring default.
  const serverInstanceId = Object.hasOwn(opts, 'serverInstanceId') ? opts.serverInstanceId : INSTANCE;
  return {
    state: {
      projectsLoaded, projects, selectedSource: PROJECT_SOURCE.LOCAL, serverInstanceId,
      liveEvaluation: { actions: { startEvaluation: vi.fn() } },
    },
    navTab: vi.fn(),
    isEvaluating,
    sharedSignal,
  };
}

// Renders the hook with props built (and tweaked) by the test.
function renderWithProps(p) {
  return renderHook((q) => useWizardLifecycle(q), { initialProps: p, wrapper: withQueryClient() });
}

function renderLifecycle(initial = {}) {
  const utils = renderHook((p) => useWizardLifecycle(p), { initialProps: props(initial), wrapper: withQueryClient() });
  const update = (next) => utils.rerender(props({ ...initial, ...next }));
  return { ...utils, update };
}

beforeEach(() => { localStorage.clear(); });

describe('useWizardLifecycle auto-open (derived)', () => {
  it('opens on the welcome step for a fresh install with nothing to show', () => {
    const { result } = renderLifecycle();
    expect(result.current.wizardEntry).toEqual({ startStep: STEP_WELCOME, isFirstProject: true, source: WIZARD_SOURCE.FIRST_RUN, instanceId: INSTANCE });
  });

  it('waits for the health poll to report the instance id before deciding', () => {
    const { result, update } = renderLifecycle({ serverInstanceId: undefined });
    expect(result.current.wizardEntry).toBeNull();
    update({ serverInstanceId: INSTANCE });
    expect(result.current.wizardEntry).not.toBeNull();
  });

  it('does not open while the project list or the shared signal is still resolving', () => {
    const { result, update } = renderLifecycle({ projectsLoaded: false, sharedSignal: UNSETTLED });
    expect(result.current.wizardEntry).toBeNull();
    update({ projectsLoaded: true, sharedSignal: UNSETTLED });
    expect(result.current.wizardEntry).toBeNull();
    update({ projectsLoaded: true, sharedSignal: NOTHING });
    expect(result.current.wizardEntry).not.toBeNull();
  });

  it('does not open when shared content arrives before the decision settles', () => {
    const { result, update } = renderLifecycle({ sharedSignal: UNSETTLED });
    update({ sharedSignal: SHARED_CONTENT });
    expect(result.current.wizardEntry).toBeNull();
  });

  it('never opens when the user opted out on this state folder', () => {
    localStorage.setItem(SKIPPED_KEY, INSTANCE);
    const { result } = renderLifecycle();
    expect(result.current.wizardEntry).toBeNull();
  });

  // The browser storage outlives a wiped ~/.quodeq (macOS keeps the
  // webview's storage under ~/Library/WebKit): a skip recorded for the old
  // folder, or the plain flag older builds wrote, must not hide the welcome
  // from the new one.
  it('opens again when the skip was recorded for another state folder', () => {
    localStorage.setItem(SKIPPED_KEY, 'inst-0');
    const { result } = renderLifecycle();
    expect(result.current.wizardEntry).not.toBeNull();
  });

  it('opens when only the legacy flag is set and the server reports an instance id', () => {
    localStorage.setItem(SKIPPED_KEY, SKIPPED_VALUE);
    const { result } = renderLifecycle();
    expect(result.current.wizardEntry).not.toBeNull();
  });

  it('honours the legacy flag for a server that reports no instance id', () => {
    localStorage.setItem(SKIPPED_KEY, SKIPPED_VALUE);
    const { result } = renderLifecycle({ serverInstanceId: null });
    expect(result.current.wizardEntry).toBeNull();
  });

  it('closes itself when shared content appears while it sits on the welcome step', () => {
    const { result, update } = renderLifecycle();
    expect(result.current.wizardEntry).not.toBeNull();
    update({ sharedSignal: SHARED_CONTENT });
    expect(result.current.wizardEntry).toBeNull();
  });

  it('a manually opened welcome wizard is not closed by shared content', () => {
    const { result, update } = renderLifecycle({ projects: [{ id: 'a' }] });
    act(() => { result.current.setWizardEntry({ startStep: STEP_WELCOME }); });
    act(() => { result.current.wizardHandlers.onStepChange(STEP_WELCOME); });
    update({ projects: [{ id: 'a' }, { id: 'pulled' }] });
    update({ projects: [{ id: 'a' }, { id: 'pulled' }], sharedSignal: SHARED_CONTENT });
    expect(result.current.wizardEntry).toEqual({ startStep: STEP_WELCOME });
  });

  it('does not reopen after an auto-close when the content disappears again', () => {
    const { result, update } = renderLifecycle();
    update({ sharedSignal: SHARED_CONTENT });
    expect(result.current.wizardEntry).toBeNull();
    update({ sharedSignal: NOTHING });
    expect(result.current.wizardEntry).toBeNull();
  });

  it('closes itself when local projects arrive (a pull or import) while it sits on the welcome step', () => {
    const { result, update } = renderLifecycle();
    update({ projects: [{ id: 'pulled' }] });
    expect(result.current.wizardEntry).toBeNull();
  });

  it('stays open once the user has moved past the welcome step', () => {
    const { result, update } = renderLifecycle();
    act(() => { result.current.wizardHandlers.onStepChange(STEP_ANALYZE); });
    update({ sharedSignal: SHARED_CONTENT });
    expect(result.current.wizardEntry).not.toBeNull();
  });

  it('does not reopen after the user closed it, whatever the inputs do next', () => {
    const { result, update } = renderLifecycle();
    act(() => { result.current.wizardHandlers.onClose({ saved: false }); });
    expect(result.current.wizardEntry).toBeNull();
    update({ sharedSignal: UNSETTLED });
    update({ sharedSignal: NOTHING });
    expect(result.current.wizardEntry).toBeNull();
  });

  it('does not open for a user who already had local projects this session', () => {
    const { result, update } = renderLifecycle({ projects: [{ id: 'a' }] });
    update({ projects: [] });
    expect(result.current.wizardEntry).toBeNull();
  });

  it('defers while an evaluation runs and opens once it ends with still nothing to show', () => {
    const { result, update } = renderLifecycle({ isEvaluating: true });
    expect(result.current.wizardEntry).toBeNull();
    update({ isEvaluating: false });
    expect(result.current.wizardEntry).not.toBeNull();
  });

  it('a welcome opened from add project is not closed by shared content', () => {
    const { result, update } = renderLifecycle();
    act(() => { result.current.wizardHandlers.onClose({ saved: false }); });
    const entry = { startStep: STEP_WELCOME, isFirstProject: true, source: WIZARD_SOURCE.ADD };
    act(() => { result.current.setWizardEntry(entry); });
    act(() => { result.current.wizardHandlers.onStepChange(STEP_WELCOME); });
    update({ sharedSignal: SHARED_CONTENT });
    expect(result.current.wizardEntry).toBe(entry);
  });
});

describe('useWizardLifecycle welcome exits', () => {
  it('closing a welcome opened from Settings never writes the skip flag', () => {
    const { result } = renderLifecycle({ projects: [{ id: 'a' }] });
    act(() => { result.current.setWizardEntry({ startStep: STEP_WELCOME, isFirstProject: false, source: WIZARD_SOURCE.SETTINGS }); });
    act(() => { result.current.wizardHandlers.onClose({ saved: false }); });
    expect(result.current.wizardEntry).toBeNull();
    expect(localStorage.getItem(SKIPPED_KEY)).toBeNull();
  });

  it('an add that started a clone closes the wizard onto the repositories tab, with nothing to select yet', () => {
    const p = props({});
    p.state.handleProjectChange = vi.fn();
    const { result } = renderWithProps(p);
    act(() => { result.current.wizardHandlers.onClose({ saved: true, projectId: null, cloning: true, landed: true }); });
    expect(result.current.wizardEntry).toBeNull();
    expect(p.navTab).toHaveBeenCalledWith(NAV_TAB.PROJECTS);
    expect(p.state.handleProjectChange).not.toHaveBeenCalled();
  });

  it('a saved exit that did not land (the X on a resume-setup walk) refetches but stays put', () => {
    const p = props({ projects: [{ id: 'a' }, { id: 'b' }] });
    p.state.handleProjectChange = vi.fn();
    p.state.selectedProject = 'a';
    const { result } = renderWithProps(p);
    act(() => { result.current.wizardHandlers.onClose({ saved: true, projectId: 'b' }); });
    expect(result.current.wizardEntry).toBeNull();
    expect(p.navTab).not.toHaveBeenCalled();
    expect(p.state.handleProjectChange).not.toHaveBeenCalled();
  });

  it('an add that registered a folder lands on the repositories tab with the project selected', () => {
    const p = props({ projects: [{ id: 'a' }] });
    p.state.handleProjectChange = vi.fn();
    p.state.selectedProject = 'a';
    const { result } = renderWithProps(p);
    act(() => { result.current.setWizardEntry({ startStep: STEP_ANALYZE, isFirstProject: false, source: WIZARD_SOURCE.ADD }); });
    act(() => { result.current.wizardHandlers.onClose({ saved: true, projectId: 'p-new', cloning: false, landed: true }); });
    expect(p.navTab).toHaveBeenCalledWith(NAV_TAB.PROJECTS);
    expect(p.state.handleProjectChange).toHaveBeenCalledWith('p-new', PROJECT_SOURCE.LOCAL);
  });

  it('go to repositories closes the wizard and opens the repositories tab', () => {
    const p = props({});
    const { result } = renderWithProps(p);
    expect(result.current.wizardEntry).not.toBeNull();
    act(() => { result.current.wizardHandlers.onGoToRepositories(); });
    expect(result.current.wizardEntry).toBeNull();
    expect(p.navTab).toHaveBeenCalledWith(NAV_TAB.PROJECTS);
  });

  it('open settings closes the wizard and opens the settings tab', () => {
    const p = props({});
    const { result } = renderWithProps(p);
    act(() => { result.current.wizardHandlers.onOpenSettings(); });
    expect(result.current.wizardEntry).toBeNull();
    expect(p.navTab).toHaveBeenCalledWith(NAV_TAB.SETTINGS);
  });
});

// A launch from the reviewer step while another project is selected: the
// launch selects the new project, so its finished first run owns the
// selection and opens the Overview.
describe('useWizardLifecycle launch hand-off', () => {
  const LAUNCH = { projectId: 'p-new', repo: '/u/me/billing', provider: { id: 'claude', model: 'sonnet' }, standardIds: ['security'], totalTimeLimitS: 0 };

  function launchFrom(selected) {
    const p = props({ projects: [{ id: 'a' }] });
    p.state.selectedProject = selected;
    p.state.handleProjectChange = vi.fn((id) => { p.state.selectedProject = id; });
    const { result } = renderWithProps(p);
    act(() => { result.current.wizardHandlers.onLaunch(LAUNCH); });
    return p;
  }

  it('a launch selects the launched project as a local one', () => {
    const p = launchFrom('a');
    expect(p.state.handleProjectChange).toHaveBeenCalledWith('p-new', PROJECT_SOURCE.LOCAL);
    expect(p.navTab).toHaveBeenLastCalledWith(NAV_TAB.EVALUATE);
  });

  it('the launched project\'s finished first run moves Evaluate to Overview', () => {
    const p = launchFrom('a');
    const queryClient = new QueryClient();
    queryClient.setQueryData(projectsKeys.list(), [{ id: 'p-new', runsCount: 0, latestRunId: null }]);
    const effect = {
      job: { status: JOB_STATUS.RUNNING, outputProject: 'p-new', outputRunId: null }, navTab: vi.fn(),
      activeTab: NAV_TAB.EVALUATE, queryClient, selectedProject: p.state.selectedProject, selectProjectAndRun: vi.fn(),
    };
    const { rerender } = renderHook((q) => useJobCompletionEffect(q), { initialProps: effect });
    rerender({ ...effect, job: { status: JOB_STATUS.DONE, outputProject: 'p-new', outputRunId: 'r1' } });
    expect(effect.selectProjectAndRun).toHaveBeenCalledWith('p-new', 'r1');
    expect(effect.navTab).toHaveBeenLastCalledWith(NAV_TAB.OVERVIEW);
  });

  it('opening settings from the reviewer step selects the added project first', () => {
    const p = props({ projects: [{ id: 'a' }] });
    p.state.selectedProject = 'a';
    p.state.handleProjectChange = vi.fn();
    const { result } = renderWithProps(p);
    act(() => { result.current.wizardHandlers.onClose({ saved: true, projectId: 'p-new', cloning: false, select: true }); });
    act(() => { result.current.wizardHandlers.onOpenSettings(); });
    expect(p.state.handleProjectChange).toHaveBeenCalledWith('p-new', PROJECT_SOURCE.LOCAL);
    expect(p.navTab).toHaveBeenCalledTimes(1);
    expect(p.navTab).toHaveBeenCalledWith(NAV_TAB.SETTINGS);
  });
});
