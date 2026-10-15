import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { useOmlxServerStatus } from './useOmlxServerStatus.js';
import { useProviderModels } from './useProviderModels.js';

// Prefix key: invalidates the models query for every apiBase/apiKey pair.
const MODELS_KEY_PREFIX = ['settings', 'omlxModels'];

/**
 * The oMLX tab's model list and server status, refetched when the server
 * comes back online, plus `reloadModels` for after a key is saved.
 */
export function useOmlxModels({ apiBase, apiKey }) {
  const { getOmlxModels } = useApi();
  const omlxStatus = useOmlxServerStatus(apiBase || undefined);

  const { models, modelsError } = useProviderModels({
    queryKey: [...MODELS_KEY_PREFIX, apiBase, apiKey],
    fetchModels: () => getOmlxModels(apiBase || undefined, apiKey || undefined),
    errorKey: 'settings.omlxModelsLoadFailed',
    serverStatus: omlxStatus?.status,
    invalidateKey: MODELS_KEY_PREFIX,
  });

  const queryClient = useQueryClient();
  // A key saved to the keychain changes what the server lists; reload.
  const reloadModels = useCallback(
    () => queryClient.invalidateQueries({ queryKey: MODELS_KEY_PREFIX }),
    [queryClient],
  );

  return { omlxStatus, models, modelsError, reloadModels };
}
