import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGradeFormula } from '../../../api/index.js';
import { gradeFormulaKeys } from '../../../api/queryKeys.js';
import { RESCORE_STATE } from '../../../vocab/rescoreState.js';
import { t } from '../../../strings/index.js';

// The named writes the editor makes, so no consumer ever sees a raw setter.
// A server response (initial load, apply, reset) is authoritative for both
// the saved formula and the draft on screen, so the draft stops being dirty.
function useFormulaIntents({ setSaved, setDraft, setIsCustom, setBusy, setError, setPartialNotice }) {
  const queryClient = useQueryClient();
  // The Map's severity weights read the same formula: keep that cache entry current.
  // The entry holds the GET payload as `{...prev, current, isCustom}`: the server's
  // other fields (defaults, rescore) stay, the formula and its custom flag are replaced.
  const adoptServerFormula = useCallback((formula, custom) => {
    setSaved(formula);
    setDraft(formula);
    setIsCustom(custom);
    queryClient.setQueryData(gradeFormulaKeys.current(), (prev) => ({ ...prev, current: formula, isCustom: custom }));
  }, [setSaved, setDraft, setIsCustom, queryClient]);

  // Start an apply/reset: busy on, last error and partial notice cleared.
  const beginRequest = useCallback(() => {
    setBusy(true);
    setError(null);
    setPartialNotice(null);
  }, [setBusy, setError, setPartialNotice]);

  const endRequest = useCallback(() => setBusy(false), [setBusy]);
  const failWith = useCallback((message) => setError(message), [setError]);
  const notePartialRescore = useCallback((notice) => setPartialNotice(notice), [setPartialNotice]);
  const updateDraft = useCallback((updater) => setDraft(updater), [setDraft]);

  return {
    adoptServerFormula, beginRequest, endRequest, failWith, notePartialRescore,
    updateDraft,
  };
}

/**
 * useGradeFormula.js's server/draft/busy/error state, the initial
 * GET-on-mount effect.
 *
 * The setters stay inside: callers get the named intents from
 * useFormulaIntents above, so the request choreography reads as what it
 * means rather than as a list of state writes.
 */
export function useGradeFormulaState() {
  const [saved, setSaved] = useState(null);     // params dict as saved server-side
  const [draft, setDraft] = useState(null);     // params dict being edited
  const [isCustom, setIsCustom] = useState(false);
  const [defaults, setDefaults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Set when an apply/reset rescored some runs but not all (a locked/corrupt
  // evaluation.db). Those runs keep the OLD formula's grades, so warn rather
  // than let the mismatch look like a bug.
  const [partialNotice, setPartialNotice] = useState(null);
  // The mount GET's payload when a background rescore is already running
  // (the user left mid-pass and came back), so the editor resumes polling.
  const [resumeFrom, setResumeFrom] = useState(null);

  const intents = useFormulaIntents({
    setSaved, setDraft, setIsCustom, setBusy, setError, setPartialNotice,
  });
  const { adoptServerFormula } = intents;

  useEffect(() => {
    getGradeFormula()
      .then((d) => {
        setDefaults(d.defaults);
        adoptServerFormula(d.current, d.isCustom);
        if (d.rescore?.state === RESCORE_STATE.RUNNING) setResumeFrom(d);
        // A pass that failed while the editor was closed: say so on return.
        if (d.rescore?.state === RESCORE_STATE.ERROR) setError(t('gradeFormula.rescoreFailed'));
      })
      .catch(() => setError(t('gradeFormula.loadFailed')));
  }, [adoptServerFormula]);

  return {
    saved, draft, isCustom, defaults, busy, error, partialNotice,
    resumeFrom, ...intents,
  };
}
