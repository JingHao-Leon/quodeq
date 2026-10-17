/**
 * The Settings page's groups, in display order, and the one-line state each
 * group's gutter shows. The state functions are pure: they take what the
 * section hooks already read and return `{ tone, text }`.
 */
import { t } from '../../strings/index.js';
import { ACCOUNT_METHOD } from '../github-access/accessVocab.js';

export const SETTINGS_GROUP = { EVALUATION: 'evaluation', ASSISTANT: 'assistant', CONNECTIONS: 'connections', APP: 'app', ABOUT: 'about' };
export const STATE_TONE = { OK: 'ok', WARN: 'warn', NONE: 'none' };

export const SETTINGS_GROUPS = [
  { id: SETTINGS_GROUP.EVALUATION, labelKey: 'settings.groupEvaluation', descKey: 'settings.groupEvaluationDesc' },
  { id: SETTINGS_GROUP.ASSISTANT, labelKey: 'settings.groupAssistant', descKey: 'settings.groupAssistantDesc' },
  { id: SETTINGS_GROUP.CONNECTIONS, labelKey: 'settings.groupConnections', descKey: 'settings.groupConnectionsDesc' },
  { id: SETTINGS_GROUP.APP, labelKey: 'settings.groupApp', descKey: 'settings.groupAppDesc' },
  { id: SETTINGS_GROUP.ABOUT, labelKey: 'settings.groupAbout', descKey: 'settings.groupAboutDesc' },
];

/** The evaluation group's line: the model ready, missing a model, or missing a provider. */
export function evaluationState({ provider, model }) {
  if (!provider) return { tone: STATE_TONE.WARN, text: t('settings.stateNoProvider') };
  if (!model) return { tone: STATE_TONE.WARN, text: t('settings.stateModelMissing', { provider }) };
  return { tone: STATE_TONE.OK, text: t('settings.stateModelReady', { provider, model }) };
}

/** The assistant group's line: off, following the evaluation model, or its own model. */
export function assistantState({ enabled, followsAnalysis, provider, model }) {
  if (!enabled) return { tone: STATE_TONE.NONE, text: t('settings.stateAssistantOff') };
  if (followsAnalysis) return { tone: STATE_TONE.NONE, text: t('settings.stateAssistantFollows') };
  return evaluationState({ provider, model });
}

/** The connections group's line: how quodeq reaches GitHub. */
export function connectionsState({ account }) {
  if (!account) return { tone: STATE_TONE.NONE, text: t('settings.stateChecking') };
  if (account.signedIn) return { tone: STATE_TONE.OK, text: t('settings.stateGithubSignedIn', { login: account.login }) };
  if (account.method === ACCOUNT_METHOD.GH) return { tone: STATE_TONE.OK, text: t('settings.stateGithubGh') };
  return { tone: STATE_TONE.NONE, text: t('settings.stateGithubNone') };
}

/** The app group's line: theme mode and palette. */
export function appState({ mode, family }) {
  return { tone: STATE_TONE.NONE, text: t('settings.stateTheme', { mode, family }) };
}

/** The about group's line: the version, or the update waiting. */
export function aboutState({ status, failed = false }) {
  if (!status) return { tone: STATE_TONE.NONE, text: t(failed ? 'settings.stateUpdateUnknown' : 'settings.stateChecking') };
  if (status.update_available) {
    return { tone: STATE_TONE.WARN, text: t('settings.stateUpdate', { current: status.current, latest: status.latest }) };
  }
  return { tone: STATE_TONE.OK, text: t('settings.stateVersion', { version: status.current }) };
}
