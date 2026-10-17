import { ACTIVE_PROVIDER_KEY, providerKey, PROVIDER_SETTING_KEY } from '../../constants.js';
import { readString, removeKey, writeString } from '../../adapters/storage.js';

/**
 * Read the model and effort saved for a provider. Settings writes the same
 * keys; an empty effort means "Default".
 *
 * @returns {{providerId: string, model: string|null, effort: string}}
 */
export function readReviewerChoice(providerId, storage) {
  return {
    providerId,
    model: readString(providerKey(providerId, PROVIDER_SETTING_KEY.MODEL), null, storage),
    effort: readString(providerKey(providerId, PROVIDER_SETTING_KEY.EFFORT), '', storage),
  };
}

/** Write one setting, removing the key when the value is empty. */
function writeOrClear(key, value, storage) {
  if (value) writeString(key, value, storage);
  else removeKey(key, storage);
}

/** Persist the chosen reviewer under the keys Settings reads. */
export function writeReviewerChoice({ providerId, model, effort }, storage) {
  writeString(ACTIVE_PROVIDER_KEY, providerId, storage);
  writeOrClear(providerKey(providerId, PROVIDER_SETTING_KEY.MODEL), model, storage);
  writeOrClear(providerKey(providerId, PROVIDER_SETTING_KEY.EFFORT), effort, storage);
}

/** The id of the catalog entry flagged `isDefault`, or null. */
export function catalogDefaultModel(catalog) {
  const entry = (catalog || []).find((m) => m.isDefault);
  return entry ? entry.id : null;
}

/** A stored model wins; otherwise the catalog default (null when none). */
export function initialModel({ stored, catalog }) {
  return stored || catalogDefaultModel(catalog);
}
