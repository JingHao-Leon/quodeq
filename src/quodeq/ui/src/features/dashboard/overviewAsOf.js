import { RUN_STATE } from '../../vocab/runState.js';
import { runAsOf } from '../violations/asOf.js';

/**
 * The past run the Overview shows, as the `asOf` its findings open with
 * (read-only); null when it shows today.
 *
 * The rule: the Overview shows today unless a finished run other than the
 * newest finished one is picked. No pick, the newest finished run (what
 * "latest" and the history's last bar resolve to), a run still in progress
 * and a run the history does not list all read as today, the same way the
 * scores query resolves them (hooks/projectScoresDerived.js resolveAsOf).
 * @param {string|null} selectedRunId the run the Overview is on
 * @param {{runId: string, dateISO?: string, status?: string}[]} availableRuns newest first
 * @returns {{runId: string, day: (string|null)}|null}
 */
export function overviewAsOf(selectedRunId, availableRuns) {
  const finished = (availableRuns || []).filter((r) => r.status !== RUN_STATE.RUNNING);
  const picked = finished.find((r) => r.runId === selectedRunId);
  if (!picked || picked === finished[0]) return null;
  return runAsOf(picked.runId, picked.dateISO);
}
