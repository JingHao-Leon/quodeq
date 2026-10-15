import { SCOPE_KIND, openScope } from '../../violations/scope/scopeModel.js';
import { runAsOf } from '../../violations/asOf.js';
import { AREA_KIND } from '../mapVocab.js';
import { areaPathFilters } from './areaPaths.js';

/** What a map node's View details opens: a file, a folder, or the whole project at the root. */
export function nodeScope({ path, isFile }) {
  if (isFile) return { kind: SCOPE_KIND.FILE, path };
  return path ? { kind: SCOPE_KIND.FOLDER, path } : { kind: SCOPE_KIND.PROJECT };
}

/**
 * An area as a scoped view: its name, its paths, whether the Map judged it
 * too small, and, on a filtered sky, the selection it was measured over (its
 * dimensions, and its principle), so its findings are that selection's.
 * @param {{name: string, kind: string}} area
 * @param {string[]} paths the area's path chips (areaPathFilters) or files
 * @param {?{dimensions: string[], principle?: string}} [selection] null: every finding
 */
export function areaScope(area, paths, selection = null) {
  const scope = { kind: SCOPE_KIND.AREA, name: area.name, paths, small: area.kind === AREA_KIND.SMALL };
  if (!selection) return scope;
  return { ...scope, dimensions: selection.dimensions, ...(selection.principle ? { principle: selection.principle } : {}) };
}

/**
 * What an area's View details opens today: its scope over the path chips
 * that hold its files among the run's (`files`, the areaSet's).
 * @param {{name: string, kind: string}} area
 * @param {{path: string, area: string}[]} files
 * @param {?{dimensions: string[], principle?: string}} [selection]
 */
export function areaFindingsScope(area, files, selection = null) {
  return areaScope(area, areaPathFilters(files, area.name), selection);
}

/**
 * Open `scope` as of a past day of the time-lapse (`run`: its last run and
 * its day), read-only. Without a named run there is no past view to open.
 * @returns {boolean} whether it navigated
 */
export function openPastScope(onNavigate, scope, run) {
  const asOf = runAsOf(run?.runId, run?.day);
  return Boolean(asOf) && openScope(onNavigate, scope, asOf);
}
