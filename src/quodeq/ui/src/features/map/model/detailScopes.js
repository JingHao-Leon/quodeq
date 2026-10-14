import { SCOPE_KIND, openScope } from '../../violations/scope/scopeModel.js';
import { runAsOf } from '../../violations/asOf.js';

/** What a map node's View details opens: a file, a folder, or the whole project at the root. */
export function nodeScope({ path, isFile }) {
  if (isFile) return { kind: SCOPE_KIND.FILE, path };
  return path ? { kind: SCOPE_KIND.FOLDER, path } : { kind: SCOPE_KIND.PROJECT };
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
