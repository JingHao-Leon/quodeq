import { useCallback, useMemo, useState } from 'react';
import { readJSON, writeJSON } from '../../../adapters/storage.js';
import { historySession } from './historySession.js';
import { originLabel } from '../../../models/runOrigin.js';

export const FILTER_ALL = 'all';
const FILTERS_KEY = 'quodeq.history.filters';
const NO_FILTERS = { origin: FILTER_ALL, model: FILTER_ALL };

function readAll() {
  const all = readJSON(FILTERS_KEY, {}, historySession());
  return all && typeof all === 'object' ? all : {};
}

function readFilters(project) {
  const stored = readAll()[project];
  return {
    origin: typeof stored?.origin === 'string' ? stored.origin : FILTER_ALL,
    model: typeof stored?.model === 'string' ? stored.model : FILTER_ALL,
  };
}

const writeFilters = (project, filters) => writeJSON(FILTERS_KEY, { ...readAll(), [project]: filters }, historySession());

/**
 * Origin and model filters over the full log; `rows` is what survives them.
 * Kept per project for the session, so opening a finding and coming back
 * finds them still on.
 */
export function useRunFilters(runs, project) {
  const [filters, setFilters] = useState(() => readFilters(project));
  const { origin, model } = filters;
  const update = useCallback((patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    writeFilters(project, next);
  }, [filters, project]);
  const rows = useMemo(() => runs.filter((r) => (
    (origin === FILTER_ALL || originLabel(r.origin) === origin) && (model === FILTER_ALL || r.model === model)
  )), [runs, origin, model]);
  return {
    rows, origin, model,
    active: origin !== FILTER_ALL || model !== FILTER_ALL,
    setOrigin: (v) => update({ origin: v }),
    setModel: (v) => update({ model: v }),
    clear: () => update(NO_FILTERS),
  };
}
