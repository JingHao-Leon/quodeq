import { localDayKey } from '../../utils/dailyGrouping.js';

const isText = (x) => typeof x === 'string' && x.length > 0;

/** The `asOf` navigation param: a run to show the project as of, and its day; null when absent or malformed. */
export function readAsOf(param) {
  if (!param || typeof param !== 'object' || !isText(param.runId)) return null;
  return { runId: param.runId, day: isText(param.day) ? param.day : null };
}

/**
 * The `asOf` param of a past run: its id, and its day ('YYYY-MM-DD') read
 * from the run's date when known; null without a run.
 */
export function runAsOf(runId, dateISO = null) {
  if (!isText(runId)) return null;
  return { runId, day: isText(dateISO) ? localDayKey(dateISO) : null };
}
