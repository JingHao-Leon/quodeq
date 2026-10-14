import { NAV_TAB } from '../../../vocab/navTab.js';

/** The Violations `asOf` param of a time-lapse run: its last run and its day; null when the history did not name it. */
export function asOfOf(run) {
  return run?.runId ? { runId: run.runId, day: run.day } : null;
}

/** The workbench chip of a folder (its path with a trailing '/'), none for the project root. */
export function folderChips(path) {
  if (!path) return [];
  return [path.endsWith('/') ? path : `${path}/`];
}

/**
 * Open Violations as of a past day, narrowed by `wb` (a folder or file chip,
 * or an area). Without a named run there is no past view to open.
 * @returns {boolean} whether it navigated
 */
export function openPastDetails(onNavigate, wb, run) {
  const asOf = asOfOf(run);
  if (!onNavigate || !asOf) return false;
  onNavigate(NAV_TAB.VIOLATIONS, { wb, asOf });
  return true;
}
