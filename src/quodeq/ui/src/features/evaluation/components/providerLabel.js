import { ACTIVE_PROVIDER_KEY, providerKey, PROVIDER_SETTING_KEY } from '../../../constants.js';
import { readString } from '../../../adapters/storage.js';

/**
 * The active provider/model pair the next run would use, for the identity
 * strips' "model" cell. Same storage keys the start payload reads, so the
 * strip can never claim a model the run won't get.
 * @returns {{provider:string, model:string, effort:string}|null} null when no
 *   provider is active; an empty effort means the model's default
 */
export function readActiveProviderModel(storage = localStorage) {
  const provider = readString(ACTIVE_PROVIDER_KEY, '', storage);
  if (!provider) return null;
  const model = readString(providerKey(provider, PROVIDER_SETTING_KEY.MODEL), '', storage);
  const effort = readString(providerKey(provider, PROVIDER_SETTING_KEY.EFFORT), '', storage);
  return { provider, model, effort };
}
