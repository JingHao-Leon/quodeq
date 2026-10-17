import { t, LOCALE } from '../../../strings/index.js';
import { extDisplayName } from '../../../utils/formatters.js';
import { pluralKey } from '../../../utils/plural.js';
import { projectFileCount, topLanguageStats } from '../projectSize.js';
import { NAV_TAB } from '../../../vocab/navTab.js';
import '../../../styles/never-evaluated.css';

// The languages read as the reviewer step's added line does.
const LANGUAGE_SEPARATOR = ' · ';
const MAX_LANGUAGES = 3;

// Each step's look: ticked, the one to do now, or still ahead (muted).
const STEP_STATE = Object.freeze({ DONE: 'done', NEXT: 'next', LATER: 'later' });

// What the scan found, when the projects list already carries it: the
// source-file count the Overview head shows, then the top languages. Null
// without a count.
function scanDetail(projectInfo) {
  const count = projectFileCount(projectInfo);
  if (!count) return null;
  const files = count.toLocaleString(LOCALE);
  const languages = topLanguageStats(projectInfo, MAX_LANGUAGES).map(([ext]) => extDisplayName(ext).toLowerCase());
  if (languages.length === 0) {
    return t(pluralKey(count, 'overview.neverEvaluatedScanFilesOne', 'overview.neverEvaluatedScanFiles'), { count: files });
  }
  const key = pluralKey(count, 'overview.neverEvaluatedScanScannedOne', 'overview.neverEvaluatedScanScanned');
  return t(key, { count: files, languages: languages.join(LANGUAGE_SEPARATOR) });
}

function Step({ state, name, hint, children }) {
  return (
    <li className={`never-evaluated__step never-evaluated__step--${state}`}>
      <span className="never-evaluated__mark" aria-hidden="true" />
      <span className="never-evaluated__name">{name}</span>
      {hint && <span className="never-evaluated__hint">{hint}</span>}
      {children}
    </li>
  );
}

/**
 * The Overview of a project that was never evaluated: what is done (the
 * scan), what comes next (who reviews it) and where grades will land, with
 * one way forward. Both buttons open Evaluate, where the first-run defaults
 * apply and the model is chosen in place.
 */
export default function NeverEvaluatedPanel({ projectName, projectInfo, onNavigate }) {
  const openEvaluate = () => onNavigate?.(NAV_TAB.EVALUATE);
  return (
    <section className="never-evaluated">
      <h2 className="never-evaluated__title">{t('overview.neverEvaluatedTitle', { name: projectName })}</h2>
      <ol className="never-evaluated__steps" aria-label={t('overview.neverEvaluatedStepsAria')}>
        <Step state={STEP_STATE.DONE} name={t('overview.neverEvaluatedScan')} hint={scanDetail(projectInfo)} />
        <Step state={STEP_STATE.NEXT} name={t('overview.neverEvaluatedReview')} hint={t('overview.neverEvaluatedReviewHint')}>
          <button type="button" className="term-btn term-btn--secondary" onClick={openEvaluate}>
            {t('overview.neverEvaluatedChoose')}
          </button>
        </Step>
        <Step state={STEP_STATE.LATER} name={t('overview.neverEvaluatedScore')} hint={t('overview.neverEvaluatedScoreHint')} />
      </ol>
      <div className="never-evaluated__actions">
        <button type="button" className="term-btn term-btn--primary term-btn--filled" onClick={openEvaluate}>
          {t('overview.neverEvaluatedStart')}
        </button>
      </div>
    </section>
  );
}
