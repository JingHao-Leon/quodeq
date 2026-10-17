import { useMemo, useState } from 'react';
import { modelEffort, useClientModels } from '../../settings/hooks/useClientModels.js';
import { initialModel, readReviewerChoice, writeReviewerChoice } from '../reviewerChoice.js';
import { serverProviderId } from '../providerLabels.js';

// The fixed, neutral order the reviewer list shows detected providers in
// (detection ids). Not the preselection ranking in useProviderDetection: no
// provider is put forward as the better one.
const REVIEWER_ORDER = Object.freeze(['claude-code', 'codex-cli', 'copilot', 'ollama', 'openai', 'anthropic']);

// Detection or server id: both name the same provider.
function orderIndex(id) {
  const index = REVIEWER_ORDER.findIndex((entry) => serverProviderId(entry) === serverProviderId(id));
  return index === -1 ? REVIEWER_ORDER.length : index;
}

/** Sort comparator for provider ids (detection or server) in the neutral reviewer order. */
export function compareReviewerOrder(a, b) {
  return orderIndex(a) - orderIndex(b);
}

/**
 * The detected providers' server ids, in the neutral reviewer order.
 *
 * @param {Array<{id?: string, detected: boolean}>} detected
 * @returns {string[]}
 */
export function orderReviewers(detected) {
  return (detected || [])
    .filter((r) => r && r.detected && r.id)
    .sort((a, b) => compareReviewerOrder(a.id, b.id))
    .map((r) => serverProviderId(r.id));
}

/**
 * One provider's model and effort: what the user picked here, else what
 * Settings stored, else (model only) the catalog's default entry.
 */
export function resolveChoice({ stored, picked, catalog }) {
  return {
    model: picked?.model !== undefined ? picked.model : initialModel({ stored: stored?.model, catalog }),
    effort: picked?.effort !== undefined ? picked.effort : (stored?.effort || ''),
  };
}

/** An effort the model does not take would be refused at start: drop it to Default. */
function effortFor(catalog, model, effort) {
  return effort && !modelEffort(catalog, model).levels.includes(effort) ? '' : effort;
}

/**
 * A reviewer being chosen among `providers` (server ids): which one, with
 * which model and effort. Starts on `initial` when it is listed, else the
 * first. Picks survive switching provider and back; nothing is stored until
 * `save` writes the selected one under the keys Settings reads.
 *
 * @param {{providers: string[], initial?: string|null, storage?: Storage}} options
 */
export function useReviewerDraft({ providers, initial = null, storage }) {
  const stored = useMemo(
    () => Object.fromEntries(providers.map((id) => [id, readReviewerChoice(id, storage)])),
    [providers, storage],
  );
  const [selected, setSelected] = useState(initial);
  const [picks, setPicks] = useState({});
  const providerId = providers.includes(selected) ? selected : (providers[0] || null);
  const { data: catalog } = useClientModels(providerId);

  const choiceFor = (id, providerCatalog) => resolveChoice({ stored: stored[id], picked: picks[id], catalog: providerCatalog });
  const { model, effort } = providerId ? choiceFor(providerId, catalog) : { model: null, effort: '' };
  const pick = (patch) => setPicks((prev) => ({ ...prev, [providerId]: { model, effort, ...prev[providerId], ...patch } }));

  return {
    providerId,
    model,
    effort,
    catalog,
    choiceFor,
    select: setSelected,
    setModel: (next) => pick({ model: next, effort: effortFor(catalog, next, effort) }),
    setEffort: (next) => pick({ effort: next }),
    ready: Boolean(providerId && model),
    save: () => writeReviewerChoice({ providerId, model, effort }, storage),
  };
}

/**
 * The reviewer being chosen on first run, among the detected providers in
 * the neutral order.
 *
 * @param {{detected: object[], storage?: Storage}} options
 */
export function useReviewerChoice({ detected, storage }) {
  const providers = useMemo(() => orderReviewers(detected), [detected]);
  return useReviewerDraft({ providers, storage });
}
