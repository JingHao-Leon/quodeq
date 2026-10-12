/**
 * The findings workbench's view state (search, filters, grouping, path chips,
 * selection). It lives in the Violations nav entry (`params.wb`), replaced on
 * every change, so back/forward and a round trip through a file restore it.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
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
  // Two changes in one event (pick a path, then clear the search) must
  // compose: each builds on the last one sent, not on the render's state.
  const latest = useRef(state);
  useEffect(() => { latest.current = state; }, [state]);
  const set = useCallback((patch) => {
    if (!onChange) return;
    latest.current = { ...latest.current, ...patch };
    onChange(latest.current);
  }, [onChange]);
  const setPaths = useCallback((paths) => set({ paths }), [set]);
  const addPath = useCallback((path) => {
    const paths = latest.current.paths;
    if (!path || paths.includes(path)) { set({}); return; }
    set({ paths: [...paths, path] });
  }, [set]);
  const removePath = useCallback((path) => set({ paths: latest.current.paths.filter((p) => p !== path) }), [set]);
  return { state, set, setPaths, addPath, removePath };
}
