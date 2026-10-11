import { t } from '../../../strings/index.js';
import { NAV_TAB } from '../../../vocab/navTab.js';
import { dayLabel, timeLabel } from './runFormat.js';

/** `Sat 11 Oct 02:45`: how the log names a run. */
export const runStamp = (run) => `${dayLabel(run.startedAt)} ${timeLabel(run.startedAt)}`;

/**
 * The finding route's params for a row of the selected run's new or resolved
 * list. A new finding lives in the selected run; a resolved one is shown as
 * it was last seen, in the comparison run (`inRun`), with a note saying so.
 */
export function findingParams({ finding, selected, inRun, resolvedIn }) {
  const shownIn = inRun || selected;
  return {
    finding,
    principle: finding.principle,
    dimension: finding.dimension,
    runId: shownIn.runId,
    dateLabel: runStamp(shownIn),
    sourceTab: NAV_TAB.HISTORY,
    crumbs: [
      t('history.termName'),
      t('history.runCrumb', { date: runStamp(selected) }),
      finding.dimension,
      String(finding.principle || '').toLowerCase(),
    ].filter(Boolean),
    note: resolvedIn && inRun
      ? t('history.resolvedNote', { resolvedIn: runStamp(resolvedIn), lastSeen: runStamp(inRun) })
      : null,
  };
}

/** The explorer route's params for a dimension row of the selected run. */
export function dimensionParams(dim, run) {
  return { dimension: dim.dimension, fromRunId: run.runId, fromDateLabel: runStamp(run) };
}
