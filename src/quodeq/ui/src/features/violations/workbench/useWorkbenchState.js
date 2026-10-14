/**
 * The findings workbench's view state (search, filters, grouping, path chips,
 * selection). It lives in the Violations nav entry (`params.wb`) so
 * back/forward and a round trip through a file restore it. The screen reads
 * a local mirror: the search text and the selection change on every key, so
 * they reach the nav entry debounced (each write is a history.replaceState);
 * every other change writes through at once, any pending text with it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SEVERITY } from '../../../vocab/severity.js';
import { FINDING_GROUP, FINDING_STATUS } from '../violationsVocab.js';

export const WORKBENCH_DEFAULTS = Object.freeze({
  q: '', severity: null, dimension: null, status: FINDING_STATUS.OPEN,
  group: FINDING_GROUP.NONE, paths: [], area: null, selectedId: null,
});

const SEVERITIES = new Set(Object.values(SEVERITY));
const STATUSES = new Set(Object.values(FINDING_STATUS));
const GROUPS = new Set(Object.values(FINDING_GROUP));
const isText = (x) => typeof x === 'string';

/** A functional area from the Map's Risk tab: its name and the path chips that hold exactly its files. */
function readArea(a) {
  if (!a || typeof a !== 'object' || !isText(a.name) || !a.name || !Array.isArray(a.paths)) return null;
  const paths = [...new Set(a.paths.filter((x) => isText(x) && x))];
  return paths.length ? { name: a.name, paths } : null;
}

export function readWorkbench(param) {
  const p = param && typeof param === 'object' ? param : {};
  return {
    q: isText(p.q) ? p.q : WORKBENCH_DEFAULTS.q,
    severity: SEVERITIES.has(p.severity) ? p.severity : null,
    dimension: isText(p.dimension) && p.dimension ? p.dimension : null,
    status: STATUSES.has(p.status) ? p.status : WORKBENCH_DEFAULTS.status,
    group: GROUPS.has(p.group) ? p.group : WORKBENCH_DEFAULTS.group,
    paths: Array.isArray(p.paths) ? [...new Set(p.paths.filter((x) => isText(x) && x))] : [],
    area: readArea(p.area),
    selectedId: isText(p.selectedId) ? p.selectedId : null,
  };
}

const sameView = (a, b) => JSON.stringify(readWorkbench(a)) === JSON.stringify(readWorkbench(b));

export const WRITE_DEBOUNCE_MS = 400;
// The fields that change per keystroke or arrow press.
const DEBOUNCED = new Set(['q', 'selectedId']);
const isDebounced = (patch) => {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((k) => DEBOUNCED.has(k));
};

/** The nav-entry writer: `write` now (any pending change with it), `schedule` one trailing write, `flush` a pending one. */
function useEntryWriter(onChange, latest) {
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const timer = useRef(null);
  const sent = useRef(null);
  const write = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (!onChangeRef.current) return;
    sent.current = latest.current;
    onChangeRef.current(latest.current);
  }, [latest]);
  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(write, WRITE_DEBOUNCE_MS);
  }, [write]);
  const flush = useCallback(() => { if (timer.current) write(); }, [write]);
  const drop = useCallback(() => { clearTimeout(timer.current); timer.current = null; }, []);
  useEffect(() => flush, [flush]);
  return { write, schedule, flush, drop, sent };
}

export function useWorkbenchState(param, onChange) {
  const [state, setState] = useState(() => readWorkbench(param));
  // Two changes in one event (pick a path, then clear the search) must
  // compose: each builds on the last one made, not on the render's state.
  const latest = useRef(state);
  const writer = useEntryWriter(onChange, latest);
  const seen = useRef(param);
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = param;
    // Our own write coming back is already the local state, and so is an
    // equal param in a new object; anything else (back, forward) replaces it.
    if (param === before || param === writer.sent.current || sameView(param, before)) return;
    writer.drop();
    latest.current = readWorkbench(param);
    setState(latest.current);
  }, [param, writer]);
  const set = useCallback((patch) => {
    latest.current = { ...latest.current, ...patch };
    setState(latest.current);
    if (isDebounced(patch)) writer.schedule(); else writer.write();
  }, [writer]);
  const setPaths = useCallback((paths) => set({ paths }), [set]);
  const addPath = useCallback((path) => {
    const paths = latest.current.paths;
    if (!path || paths.includes(path)) { set({}); return; }
    set({ paths: [...paths, path] });
  }, [set]);
  const removePath = useCallback((path) => set({ paths: latest.current.paths.filter((p) => p !== path) }), [set]);
  return { state, set, setPaths, addPath, removePath, flush: writer.flush };
}
