import { t } from '../../../strings/index.js';
import { Step, STEP_STATE } from '../../dashboard/components/NeverEvaluatedPanel.jsx';
import '../../../styles/never-evaluated.css';

// What the pull step says and offers: the conflict confirm, the running
// download, a failure with its reason, or the first ask.
function pullStep({ projectId, remotePull }) {
  const { pullingId, pullError, pullConflictId, pullConflictExistingId } = remotePull;
  if (pullConflictId === projectId) {
    // The server named the local project it collided with: theirs is the
    // natural one to evaluate, a copy is the fallback.
    const existing = pullConflictExistingId || null;
    return { conflict: true, existing, hint: t(existing ? 'evaluate.remotePullHaveIt' : 'evaluate.remotePullExists') };
  }
  if (pullingId === projectId) return { pulling: true, hint: t('projects.pulling') };
  if (pullError?.projectId === projectId) {
    return { failed: true, hint: <span className="never-evaluated__error" role="alert">{pullError.message}</span> };
  }
  return { hint: t('evaluate.remotePullHint') };
}

function PullAction({ projectId, step, remotePull }) {
  if (step.conflict) {
    const copyClass = step.existing ? 'term-btn term-btn--secondary' : 'term-btn term-btn--primary term-btn--filled';
    return (
      <>
        <button type="button" className="term-btn term-btn--secondary" onClick={() => remotePull.cancelConflict(projectId)}>
          {t('evaluate.cancelBtn')}
        </button>
        <button type="button" className={copyClass} onClick={() => remotePull.confirmCopy(projectId)}>
          {t('evaluate.remotePullCopy')}
        </button>
        {step.existing && (
          <button type="button" className="term-btn term-btn--primary term-btn--filled" onClick={() => remotePull.openExisting(projectId)}>
            {t('evaluate.remotePullOpenExisting')}
          </button>
        )}
      </>
    );
  }
  // Another project's pull holds the one pull slot.
  const busy = step.pulling || Boolean(remotePull.pullingId);
  let label = t('projects.pullLocalCopy');
  if (step.pulling) label = t('evaluate.remotePulling');
  else if (step.failed) label = t('evaluate.remotePullRetry');
  return (
    <button type="button" className="term-btn term-btn--primary term-btn--filled" disabled={busy} onClick={() => remotePull.start(projectId)}>
      {label}
    </button>
  );
}

/**
 * Evaluate for a remote project. Evaluations run on a local copy, so the
 * first step is pulling one; the review and score steps read as on a
 * never-evaluated project. The pull itself is the app's (useRemoteEvaluatePull),
 * which lands the person on the local copy's Evaluate when it finishes.
 */
export default function RemoteEvaluatePanel({ projectId, projectName, remotePull }) {
  const step = pullStep({ projectId, remotePull });
  return (
    <section className="never-evaluated">
      <h2 className="never-evaluated__title">{t('evaluate.remoteTitle', { name: projectName || projectId })}</h2>
      <p className="never-evaluated__lede">{t('evaluate.remoteLede')}</p>
      <ol className="never-evaluated__steps" aria-label={t('evaluate.remoteStepsAria')}>
        <Step state={STEP_STATE.NEXT} name={t('evaluate.remotePull')} hint={step.hint} />
        <Step state={STEP_STATE.LATER} name={t('overview.neverEvaluatedReview')} hint={t('overview.neverEvaluatedReviewHint')} />
        <Step state={STEP_STATE.LATER} name={t('overview.neverEvaluatedScore')} hint={t('overview.neverEvaluatedScoreHint')} />
      </ol>
      <div className="never-evaluated__actions">
        <PullAction projectId={projectId} step={step} remotePull={remotePull} />
      </div>
    </section>
  );
}
