import { t } from '../../../strings/index.js';
import { NAV_TAB } from '../../../vocab/navTab.js';
import { originLabel } from '../../../models/runOrigin.js';
import { timeLabel } from './runFormat.js';

const PART_SEPARATOR = ' · ';

/** One line above the log while a run is in progress. */
export default function RunningLine({ job, onNavigate }) {
  if (!job) return null;
  const parts = [
    originLabel(job.origin),
    job.model,
    job.currentDimension ? t('history.runningOn', { dimension: job.currentDimension }) : null,
    job.startedAt ? t('history.runningSince', { time: timeLabel(job.startedAt) }) : null,
  ].filter(Boolean);
  return (
    <div className="rl-running">
      <span className="eval-run-dot" aria-hidden="true" />
      <span>{t('history.runningNow')}</span>
      <span className="rl-muted">{parts.join(PART_SEPARATOR)}</span>
      <button type="button" className="eval-pill-btn rl-running__go" onClick={() => onNavigate(NAV_TAB.EVALUATE)}>
        {t('history.openInEvaluate')}
      </button>
    </div>
  );
}
