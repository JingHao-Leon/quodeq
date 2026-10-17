import { PROVIDER_SETTING_KEY } from '../constants.js';

/**
 * useEvaluationLifecycle.js's storage-read and subagent-model-resolution
 * helpers.
 */

// A storage read degrades the same way wherever the store throws. A
// function (not a shared string constant) so the literal stays a direct
// console.warn() argument -- lint:strings' dev-channel exemption only
// recognises that shape, not a literal read from a variable.
function warnStorageUnavailable(e) {
  console.warn('localStorage unavailable:', e);
}

/**
 * Storage reads degrade to '' when the backing store throws (private
 * mode, disabled storage) instead of crashing the caller.
 */
export function safeGetItem(storage, key) {
  try { return storage.getItem(key) || ''; } catch (e) { warnStorageUnavailable(e); return ''; }
}

/**
 * Ollama can set a separate analysis model; everything else analyses with the
 * main model.
 */
export function resolveSubagentModel({ get }) {
  return get(PROVIDER_SETTING_KEY.MODEL_ANALYSIS) || get(PROVIDER_SETTING_KEY.MODEL) || undefined;
}
