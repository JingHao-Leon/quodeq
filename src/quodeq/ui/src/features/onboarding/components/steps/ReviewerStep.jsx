import ReviewerList from '../reviewer/ReviewerList.jsx';
import { useReviewerStep } from '../../hooks/useReviewerStep.js';
import { DETECTION_STATUS } from '../../onboardingVocab.js';
import { t, LOCALE } from '../../../../strings/index.js';
import { pluralKey } from '../../../../utils/plural.js';

// The languages read as the evaluate card's detected line does.
const LANGUAGE_SEPARATOR = ' · ';

// "✓ billing added", with the scan's source-file count and languages when a
// folder was scanned (a clone has neither yet).
function addedLine({ name, fileCount, languages }) {
  if (!fileCount) return t('onboarding.reviewerAdded', { name });
  const count = fileCount.toLocaleString(LOCALE);
  if (languages.length === 0) {
    return t(pluralKey(fileCount, 'onboarding.reviewerAddedFilesOne', 'onboarding.reviewerAddedFiles'), { name, count });
  }
  const key = pluralKey(fileCount, 'onboarding.reviewerAddedScannedOne', 'onboarding.reviewerAddedScanned');
  return t(key, { name, count, languages: languages.join(LANGUAGE_SEPARATOR) });
}

// The detected providers as a list; a quiet line while the probes run, and
// a way to Settings when none answered.
function ReviewerChoices({ step, onOpenSettings }) {
  if (step.status === DETECTION_STATUS.DETECTING) {
    return <p className="analyze-block__hint">{t('onboarding.reviewerDetecting')}</p>;
  }
  if (step.detected.length === 0) {
    return (
      <div className="reviewer-step__none">
        <p className="analyze-block__hint">{t('onboarding.reviewerNoneFound')}</p>
        <button type="button" className="term-btn term-btn--secondary" onClick={onOpenSettings}>
          {t('onboarding.reviewerSetUp')}
        </button>
      </div>
    );
  }
  return <ReviewerList detected={step.detected} choice={step.choice} onOpenSettings={onOpenSettings} />;
}

// What the first evaluation covers (once the dimensions load), or for a
// clone where the download goes on.
function ScopeLine({ cloning, count }) {
  if (cloning) return <p className="analyze-block__hint">{t('onboarding.reviewerCloneHint')}</p>;
  if (!count) return null;
  return <p className="analyze-block__hint">{t('onboarding.reviewerScope', { count })}</p>;
}

// Why start stays disabled when the dimensions could not load.
function DimensionError({ message }) {
  if (!message) return null;
  return <p className="reviewer-step__error" role="alert">{message}</p>;
}

// A folder starts its first evaluation here; a clone (no project until it
// lands) only saves the reviewer for it and closes.
function ReviewerActions({ step, cloning }) {
  if (cloning) {
    return (
      <div className="onboarding-step__actions onboarding-step__actions--end">
        <button type="button" className="term-btn term-btn--primary term-btn--filled" onClick={step.saveAndClose}>
          {t('onboarding.reviewerSaveClose')}
        </button>
      </div>
    );
  }
  return (
    <div className="onboarding-step__actions onboarding-step__actions--split">
      <button type="button" className="term-btn term-btn--ghost" onClick={step.later}>
        {t('onboarding.reviewerLater')}
      </button>
      <button type="button" className="term-btn term-btn--primary term-btn--filled" disabled={!step.canStart} onClick={step.start}>
        {t('onboarding.reviewerStart')}
      </button>
    </div>
  );
}

/**
 * The add panel's second screen: which detected provider reviews the
 * project just added, then its first evaluation (every dimension, no time
 * limit) or a landing on Repositories. `added` is addedSummary's result;
 * `onStart({ provider, standardIds })` launches, `onLater` lands, both after
 * the choice is saved.
 */
export default function ReviewerStep({ added, onStart, onLater, onOpenSettings }) {
  const step = useReviewerStep({ onStart, onLater });
  return (
    <div className="onboarding-step onboarding-step--reviewer">
      <p className="reviewer-step__added">{addedLine(added)}</p>
      <section className="analyze-block">
        <h3 className="analyze-block__title">{t('onboarding.reviewerTitle')}</h3>
        <p className="analyze-block__hint">{t('onboarding.reviewerHint')}</p>
        <ReviewerChoices step={step} onOpenSettings={onOpenSettings} />
      </section>
      <ScopeLine cloning={added.cloning} count={step.dimensionCount} />
      {!added.cloning && <DimensionError message={step.dimLoadError} />}
      <ReviewerActions step={step} cloning={added.cloning} />
    </div>
  );
}
