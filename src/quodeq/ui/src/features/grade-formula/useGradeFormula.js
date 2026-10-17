import { useCallback } from 'react';
import { saveGradeFormula, resetGradeFormula } from '../../api/index.js';
import { defaultGradeThresholdsStore } from '../../utils/gradeThresholds.js';
import { setDimensionWeights } from '../../utils/dimensionWeights.js';
import { RESCORE_STATE } from '../../vocab/rescoreState.js';
import { useGradeFormulaState } from './hooks/useGradeFormulaState.js';
import { clampFloors, clampSeverity } from './gradeFormulaRules.js';
import { useRescoreProgress } from './hooks/useRescoreProgress.js';
import { t } from '../../strings/index.js';
import { pluralKey } from '../../utils/plural.js';

// Singular and plural are separate whole sentences, not a stem plus an "s":
// the verb agreement moves too ("shows" vs "show"), and plenty of languages
// inflect more of the sentence than English does.
function noticeFor(rescore) {
  return rescore.failed > 0
    ? t(pluralKey(rescore.failed, 'gradeFormula.partialRescoreOne', 'gradeFormula.partialRescoreMany'), { count: rescore.failed })
    : null;
}

// Once the server's pass for the latest apply has landed (or given up) while
// the editor is open: warn about runs that kept the old grades. The app-level
// tracker drops the stale score caches whether or not the editor is open.
function settleRescore(payload, { failWith, notePartialRescore }) {
  const { rescore } = payload;
  if (rescore.state === RESCORE_STATE.ERROR) failWith(t('gradeFormula.rescoreFailed'));
  else notePartialRescore(noticeFor(rescore));
}

// The editor's one write path into the draft: every patch is clamped first.
function useDraftPatch(updateDraft) {
  return useCallback((patch) => {
    updateDraft((prev) => ({ ...prev, ...clampSeverity(prev, clampFloors(prev, patch)) }));
  }, [updateDraft]);
}

/**
 * Grade-formula editor state: server params, dirty draft, background-rescore
 * progress.
 * thresholdsStore: grade-thresholds store apply/reset push the applied
 * boundaries into; defaults to the app-wide store, injectable so tests
 * don't leak grading state into the rest of the process.
 *
 * Composes hooks/useGradeFormulaState.js (server/draft/busy/error
 * state + the initial load) and hooks/useRescoreProgress.js (the page's view of
 * the app-level rescore tracker in rescore/, which polls after an
 * apply/reset: the server answers with 202 and finishes in the background), and owns apply/resetToDefaults.
 */
export default function useGradeFormula(thresholdsStore = defaultGradeThresholdsStore) {
  const {
    saved, draft, isCustom, retiredCustom, defaults, ranges, busy, error, partialNotice, resumeFrom,
    adoptServerFormula, beginRequest, endRequest, failWith, notePartialRescore, updateDraft,
  } = useGradeFormulaState();

  const isDirty = saved && draft && JSON.stringify(saved) !== JSON.stringify(draft);

  const update = useDraftPatch(updateDraft);

  const { rescoreProgress, track } = useRescoreProgress(
    (payload) => settleRescore(payload, { failWith, notePartialRescore }),
    resumeFrom,
  );

  // Apply and reset differ only in which endpoint they call, what they log
  // and what they return; everything the server sends back is adopted the
  // same way. `run` performs the write and returns the formula payload.
  const submitFormula = useCallback(async (run, failureKey, logLabel) => {
    beginRequest();
    try {
      const d = await run();
      adoptServerFormula(d.current, d.isCustom, d.retiredCustom);
      thresholdsStore.set(d.current.gradeThresholds);
      setDimensionWeights(d.current);
      track(d);
      return d;
    } catch (err) {
      console.warn(logLabel, err);
      failWith(t(failureKey));
      return null;
    } finally {
      endRequest();
    }
  }, [track, thresholdsStore, beginRequest, endRequest, failWith, adoptServerFormula]);

  const apply = useCallback(async () => {
    const d = await submitFormula(
      () => saveGradeFormula(draft),
      'gradeFormula.applyFailed',
      '[useGradeFormula] apply failed:',
    );
    return d ? d.rescore : null;
  }, [draft, submitFormula]);

  // The server's payload, or null when the reset failed (the error is set).
  const resetToDefaults = useCallback(async () => submitFormula(
    resetGradeFormula,
    'gradeFormula.resetFailed',
    '[useGradeFormula] reset failed:',
  ), [submitFormula]);

  return {
    saved, draft, defaults, ranges, isCustom, retiredCustom, isDirty, busy, error, partialNotice, rescoreProgress,
    update, apply, resetToDefaults,
  };
}
