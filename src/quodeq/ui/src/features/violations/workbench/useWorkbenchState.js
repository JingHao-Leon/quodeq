/**
 * The findings workbench's view state (search, filters, grouping, path chips,
 * selection). It lives in the Violations nav entry (`params.wb`), replaced on
 * every change, so back/forward and a round trip through a file restore it.
 */
import { useCallback, useMemo } from 'react';
import { SEVERITY } from '../../../vocab/severity.js';
import { FINDING_GROUP, FINDING_STATUS } from '../violationsVocab.js';

export const WORKBENCH_DEFAULTS = Object.freeze({
  q: '', severity: null, dimension: null, status: FINDING_STATUS.OPEN,
  group: FINDING_GROUP.NONE, paths: [], selectedId: null,
});

const SEVERITIES = new Set(Object.values(SEVERITY));
const STATUSES = new Set(Object.values(FINDING_STATUS));
const GROUPS = new Set(Object.values(FINDING_GROUP));
const isText = (x) => typeof x === 'string';

export function readWorkbench(param) {
  const p = param && typeof param === 'object' ? param : {};
  return {
    q: isText(p.q) ? p.q : WORKBENCH_DEFAULTS.q,
    severity: SEVERITIES.has(p.severity) ? p.severity : null,
    dimension: isText(p.dimension) && p.dimension ? p.dimension : null,
    status: STATUSES.has(p.status) ? p.status : WORKBENCH_DEFAULTS.status,
    group: GROUPS.has(p.group) ? p.group : WORKBENCH_DEFAULTS.group,
    paths: Array.isArray(p.paths) ? p.paths.filter((x) => isText(x) && x) : [],
    selectedId: isText(p.selectedId) ? p.selectedId : null,
  };
}

export function useWorkbenchState(param, onChange) {
  const state = useMemo(() => readWorkbench(param), [param]);
  const set = useCallback((patch) => onChange?.({ ...state, ...patch }), [state, onChange]);
  const setPaths = useCallback((paths) => set({ paths }), [set]);
  const addPath = useCallback((path) => {
    if (!path || state.paths.includes(path)) { set({}); return; }
    set({ paths: [...state.paths, path] });
  }, [state.paths, set]);
  const removePath = useCallback((path) => set({ paths: state.paths.filter((p) => p !== path) }), [state.paths, set]);
  return { state, set, setPaths, addPath, removePath };
}
