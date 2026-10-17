import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { settingsKeys } from '../../../api/queryKeys.js';
import { PROVIDER } from '../../../vocab/provider.js';

// The CLI providers that report a live model catalog (labels, descriptions,
// supported efforts) for the signed-in account.
export const CATALOG_PROVIDERS = Object.freeze([PROVIDER.CLAUDE, PROVIDER.CODEX]);

// Five minutes: the server caches the catalog for ten, so the page need not
// ask again while Settings stays open.
const CATALOG_STALE_MS = 300_000;

async function readCatalog(api, providerId, options) {
  const result = await api.getClientModels(providerId, options);
  if (result?.error) throw new Error(result.error);
  if (!Array.isArray(result?.catalog) || !result.catalog.length) throw new Error('empty model catalog');
  return result.catalog;
}

/**
 * The live model catalog of a CLI provider, or an idle query for one that has
 * none. `refresh()` asks the CLI again, past the server's cache.
 */
export function useClientModels(providerId) {
  const api = useApi();
  const queryClient = useQueryClient();
  const enabled = CATALOG_PROVIDERS.includes(providerId);
  const query = useQuery({
    queryKey: settingsKeys.clientModels(providerId),
    queryFn: () => readCatalog(api, providerId),
    enabled,
    staleTime: CATALOG_STALE_MS,
    retry: false,
  });
  async function refresh() {
    await queryClient.fetchQuery({
      queryKey: settingsKeys.clientModels(providerId),
      queryFn: () => readCatalog(api, providerId, { refresh: true }),
      staleTime: 0,
    });
  }
  return { ...query, enabled, refresh };
}

/** The catalog entry for *modelId*, or undefined when it is not listed. */
export function findCatalogModel(catalog, modelId) {
  return (catalog || []).find((entry) => entry.id === modelId);
}

/**
 * The efforts *modelId* takes: the catalog's own list when the CLI listed the
 * model (empty = no effort setting), else the provider's static levels from
 * ai_providers.json. `defaultEffort` is the model's default when known.
 */
export function modelEffort(catalog, modelId, staticLevels = []) {
  const entry = findCatalogModel(catalog, modelId);
  if (!entry) return { levels: staticLevels, defaultEffort: null };
  return { levels: entry.efforts || [], defaultEffort: entry.defaultEffort || null };
}
