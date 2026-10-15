/**
 * What History says about a cancelled run: listed with its own grade but not
 * a point of the score history. Its row reads how far it got ("cancelled ·
 * 4 of 6"), its detail one quiet line on how and where it stopped.
 */
import { t, LOCALE } from '../../../strings/index.js';
import { formatDurationCoarse } from '../../../utils/dateFormatting.js';
import { exitReasonInfo, isPlainCancelExit } from '../../../models/exitReason.js';

const DIM_LIST = new Intl.ListFormat(LOCALE, { style: 'long', type: 'conjunction' });
const SENTENCE_GAP = ' ';
const ONE = 1;

// The first sentence, by what is known: how long it ran, why it stopped.
const STOPPED_KEY = {
  timeReason: 'history.cancelledAfterBecause',
  time: 'history.cancelledAfter',
  reason: 'history.cancelledBecause',
  none: 'history.cancelledOnly',
};

/**
 * The dimensions a cancelled run planned but did not finish, and how many it
 * planned (null when the run did not record its plan).
 */
export function cancelledScope(run) {
  const dims = run.dims || [];
  if (!run.plannedDims?.length) return { planned: null, missing: [] };
  const done = new Set(dims);
  const missing = run.plannedDims.filter((d) => !done.has(d));
  return { planned: dims.length + missing.length, missing };
}

/** The run list's scope for a cancelled run: `cancelled · 4 of 6`, or `cancelled · 4 dims` without a plan. */
export function cancelledScopeLabel(run) {
  const done = (run.dims || []).length;
  const { planned } = cancelledScope(run);
  return planned == null
    ? t('history.scopeCancelledDims', { count: done })
    : t('history.scopeCancelledOf', { done, planned });
}

/** Why the run stopped, in the exit-reason wording; null when it adds nothing to "cancelled". */
function stopReason(code) {
  const info = exitReasonInfo(code);
  return info && !isPlainCancelExit(code) ? info.label : null;
}

function stoppedSentence(run) {
  const duration = run.activeSeconds > 0 ? formatDurationCoarse(run.activeSeconds) : null;
  const reason = stopReason(run.exitReason);
  const which = duration && reason ? 'timeReason' : duration ? 'time' : reason ? 'reason' : 'none';
  return t(STOPPED_KEY[which], { duration, reason });
}

function finishedSentence(run) {
  const done = (run.dims || []).length;
  const { planned, missing } = cancelledScope(run);
  if (planned == null) return t(done === ONE ? 'history.cancelledFinishedOne' : 'history.cancelledFinishedMany', { count: done });
  if (!missing.length) return t('history.cancelledFinishedAllOf', { done, planned });
  return t('history.cancelledFinishedOf', { done, planned, missing: DIM_LIST.format(missing) });
}

/** The detail's line for a cancelled run: how it stopped, what it finished, what happens to its work. */
export function cancelledNote(run) {
  return [stoppedSentence(run), finishedSentence(run), t('history.cancelledReused')].join(SENTENCE_GAP);
}
