import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { ACTIVE_PROVIDER_KEY, providerKey, PROVIDER_SETTINGS_CHANGED_EVENT, PROVIDER_SETTING_KEY } from '../../../constants.js';
import { GITHUB_ACCOUNT_QUERY_KEY } from '../../github-access/accessVocab.js';
import { useAiClientList } from './useAiClientList.js';
import useLiveFeedSettings from './useLiveFeedSettings.js';
import { useSettingsChangeSync } from './settingsSync.js';
import { modelState, evaluationState, connectionsState, appState, aboutState, SETTINGS_GROUP } from '../settingsGroups.js';

const MODEL_EVENTS = [PROVIDER_SETTINGS_CHANGED_EVENT];

function readStoredModel(storage) {
  const provider = storage.getItem(ACTIVE_PROVIDER_KEY) || '';
  return { provider, modelOf: (id) => storage.getItem(providerKey(id, PROVIDER_SETTING_KEY.MODEL)) || '' };
}

// The provider the analysis tab shows: the stored choice, else the first
// installed client (the tab's own default before anything is stored).
function shownProvider(stored, clients) {
  if (stored) return stored;
  const first = clients.find((c) => c.installed !== false) || clients[0];
  return first?.id || '';
}

/**
 * Each settings group's gutter line, read from the same hooks and queries
 * the group's sections use (`update` is the page's shared update status).
 * Re-reads the model whenever a provider setting
 * changes, in this window or another.
 * @returns {Record<string, {tone: string, text: string}>}
 */
export default function useSettingsGroupStates({ providerConfigs, theme, update, storage = localStorage }) {
  const [stored, setStored] = useState(() => readStoredModel(storage));
  const load = useCallback(readStoredModel, []);
  useSettingsChangeSync(MODEL_EVENTS, { load, setState: setStored, storage });
  const { clients } = useAiClientList(providerConfigs);
  const provider = shownProvider(stored.provider, clients);
  const { newOnly } = useLiveFeedSettings();
  const { getGithubAccount } = useApi();
  const { data: account } = useQuery({ queryKey: GITHUB_ACCOUNT_QUERY_KEY, queryFn: getGithubAccount });
  return {
    [SETTINGS_GROUP.MODEL]: modelState({ provider, model: provider ? stored.modelOf(provider) : '' }),
    [SETTINGS_GROUP.EVALUATION]: evaluationState({ newOnly }),
    [SETTINGS_GROUP.CONNECTIONS]: connectionsState({ account }),
    [SETTINGS_GROUP.APP]: appState({ mode: theme.mode, family: theme.family }),
    [SETTINGS_GROUP.ABOUT]: aboutState({ status: update.status, failed: update.failed }),
  };
}
