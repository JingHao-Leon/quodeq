import { clearDraft, markWelcomeSkipped } from './useWizardDraft.js';
import { SETUP_ORDER } from '../wizardSteps.js';
import { SCAN_SUB_STATE } from '../onboardingVocab.js';

// The resume-setup walk (SETUP_ORDER: provider, then standard and launch):
// its step navigation and the launch with the wizard's scope, branch,
// provider and time limit. The analyze screen no longer launches anything.
function resumeWalk({ wizard, onLaunch }) {
  function handleLaunch({ projectId = wizard.state.projectId, repo = wizard.state.repo.value, standardIds }) {
    wizard.startLaunch();
    clearDraft();
    onLaunch({
      projectId,
      repo,
      scopePath: wizard.state.repo.scopePath || null,
      branch: wizard.state.repo.branch || null,
      provider: wizard.state.provider,
      standardIds,
      totalTimeLimitS: wizard.state.totalTimeLimitS,
    });
  }

  function nextStep() {
    const i = SETUP_ORDER.indexOf(wizard.state.step);
    wizard.goToStep(SETUP_ORDER[i + 1] || wizard.state.step);
  }

  function prevStep() {
    const i = SETUP_ORDER.indexOf(wizard.state.step);
    if (i > 0) wizard.goToStep(SETUP_ORDER[i - 1]);
  }

  return { handleLaunch, nextStep, prevStep };
}

// A first evaluation runs every dimension with no time limit (0 = no limit).
const NO_TIME_LIMIT_S = 0;

// The reviewer step that follows an add: start the first evaluation, or
// land on Repositories (later, save and close, the X), or step aside to
// Settings. `wizard.state.added` is what the add panel handed over.
function reviewerExits({ wizard, onClose, onLaunch, onOpenSettings }) {
  const added = () => wizard.state.added || { projectId: null, cloning: false };

  // The add panel's hand-over: a registered project (`hasRuns` when a
  // resumed one was evaluated before), or a clone job that started (the
  // Repositories tile carries on). The panel stays open.
  function handleAdded({ projectId = null, cloning = false, hasRuns = false }) {
    wizard.markAdded({ projectId, cloning, hasRuns });
  }

  // `landed` is what moves the app to Repositories and selects the project;
  // a saved exit (the X on a resume-setup walk) only refetches.
  function handleLater() {
    clearDraft();
    const { projectId, cloning } = added();
    onClose({ saved: true, projectId, cloning, landed: true });
  }

  // The evaluation starts on the project's local folder: the server refuses
  // a git url as a target.
  function handleStartFirst({ provider, standardIds }) {
    clearDraft();
    onLaunch({
      projectId: added().projectId,
      repo: wizard.state.projectPath || wizard.state.repo.value,
      provider,
      standardIds,
      totalTimeLimitS: NO_TIME_LIMIT_S,
    });
  }

  // The added project is saved (the list refetches) and selected, then
  // Settings opens.
  function handleOpenSettings() {
    clearDraft();
    const { projectId, cloning } = added();
    onClose({ saved: true, projectId, cloning, select: true });
    onOpenSettings?.();
  }

  return { handleAdded, handleLater, handleStartFirst, handleOpenSettings };
}

/**
 * The wizard's exits: skipping the welcome (to Repositories, and remembered
 * unless opened from Settings), stepping aside for an archive import,
 * closing (a scanned project counts as saved; after an add it lands like
 * `later`), the reviewer step after an add (reviewerExits) and the
 * resume-setup walk (resumeWalk). Each exit clears the draft.
 */
export function useOnboardingWizardHandlers({
  wizard, onClose, onLaunch, onGoToRepositories, onOpenSettings, fromSettings = false, instanceId = null,
}) {
  const reviewer = reviewerExits({ wizard, onClose, onLaunch, onOpenSettings });
  // A welcome opened from Settings offers no skip; even if one fires, a user
  // who went looking for the welcome has not opted out. Skip lands on
  // Repositories and is remembered for this state folder (instanceId).
  function handleSkipWelcome() {
    if (!fromSettings) markWelcomeSkipped(undefined, instanceId);
    clearDraft();
    onGoToRepositories();
  }

  // The welcome's archive card: the import runs its own native dialog and
  // toasts, so the wizard steps aside first (no skip flag).
  function handleImport(onImportProject) {
    clearDraft();
    onClose({ saved: false });
    onImportProject?.();
  }

  function handleSavedExit() {
    clearDraft();
    onClose({ saved: true, projectId: wizard.state.projectId });
  }

  function handleClose() {
    if (wizard.state.added) {
      reviewer.handleLater();
    } else if (wizard.state.repoScanSubState === SCAN_SUB_STATE.SCANNED) {
      handleSavedExit();
    } else {
      clearDraft();
      onClose({ saved: false });
    }
  }

  return { handleSkipWelcome, handleImport, handleSavedExit, handleClose, ...reviewer, ...resumeWalk({ wizard, onLaunch }) };
}
