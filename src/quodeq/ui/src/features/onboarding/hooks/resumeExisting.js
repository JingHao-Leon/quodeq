import { HTTP_STATUS } from '../../../constants.js';

// Lifts the adapter's 30s default so a resume scan (which reads a project
// that may not have finished its first scan yet) isn't cut short.
const RESUME_SCAN_TIMEOUT_MS = 120000;

/**
 * 409 + existingProjectId means a project was already registered for this
 * repo: resume into it (an abandoned earlier onboarding, or a repository
 * added again) and say whether it already has evaluations, so the reviewer
 * step offers a plain evaluation rather than a first one.
 *
 * @param {{ getProjectInfo: Function, getProjectScan: Function, actions: { succeedScan: Function } }} deps
 * @returns {(existingProjectId: string) => Promise<{hasRuns: boolean}|null>} null when it could not resume
 */
export function makeTryResumeExisting({ getProjectInfo, getProjectScan, actions }) {
  return async function tryResumeExisting(existingProjectId) {
    try {
      const info = await getProjectInfo(existingProjectId);
      // Timeout so a backend that accepts but never responds cannot stall
      // the resume flow; the catch below falls back to the normal error UI
      // (the adapter rejects on non-2xx too, landing in the same catch).
      // The explicit `timeout` lifts the adapter's 30s default to match.
      const scanData = await getProjectScan(existingProjectId, {
        signal: AbortSignal.timeout(RESUME_SCAN_TIMEOUT_MS),
        timeout: RESUME_SCAN_TIMEOUT_MS,
      });
      actions.succeedScan(existingProjectId, scanData, info.path);
      return { hasRuns: info.runsCount > 0 };
    } catch (err) {
      console.warn('[resumeExisting] resume existing project failed:', err);
      return null;
    }
  };
}

/**
 * A repo that is already registered comes back as a 409 carrying the
 * existing project id: resuming it is the right answer, not a failure.
 *
 * @param {{ status?: number, existingProjectId?: string }} err
 * @param {(id: string) => Promise<{hasRuns: boolean}|null>} tryResumeExisting
 * @returns {Promise<{hasRuns: boolean}|null>} the resume, or null when it did not resume
 */
export async function resumedExisting(err, tryResumeExisting) {
  if (err.status !== HTTP_STATUS.CONFLICT || !err.existingProjectId) return null;
  return (await tryResumeExisting(err.existingProjectId)) || null;
}
