import { GRANULARITY } from '../../../utils/granularity.js';
import { bucketKey } from '../../../utils/dailyGrouping.js';

/**
 * Each period's runs, grouped as the Overview groups its history (the app's
 * granularity and its bucket keys): the index of the period's last run (what
 * the period shows: the project as it stood at the end of it) and the day its
 * first run falls on.
 * @param {{day: string}[]} runs oldest first
 * @param {string} granularity a GRANULARITY
 * @returns {{last: number, firstDay: string}[]}
 */
export function periodEnds(runs, granularity) {
  const out = [];
  runs.forEach((run, k) => {
    const key = bucketKey(run.day, granularity);
    const open = out[out.length - 1];
    if (open && open.key === key) open.last = k;
    else out.push({ key, last: k, firstDay: run.day });
  });
  return out.map(({ last, firstDay }) => ({ last, firstDay }));
}

/** One period as a run: its last run's day and issues, the new and fixed issues of all its runs. */
function periodRun(runs, from, to, firstDay) {
  let added = 0;
  let fixed = 0;
  for (let k = from; k <= to; k++) { added += runs[k].added; fixed += runs[k].fixed; }
  return { ...runs[to], added, fixed, firstDay };
}

/**
 * The frames the time-lapse plays: one per day, week or month, each the
 * project at the end of that period (its last run), with the new and fixed
 * issues of the whole period. `ends[i]` is frame i's run in the history, so
 * the views keep playing the history itself (one model, one layout) and only
 * the runs they are sent to change.
 * @param {{day: string, added: number, fixed: number}[]} runs the history's runs, oldest first
 * @param {string} granularity a GRANULARITY
 * @returns {{runs: object[], ends: number[]}}
 */
export function framesByPeriod(runs, granularity) {
  if (granularity !== GRANULARITY.WEEK && granularity !== GRANULARITY.MONTH) return { runs, ends: runs.map((_, k) => k) };
  const periods = periodEnds(runs, granularity);
  return {
    runs: periods.map((end, i) => periodRun(runs, i ? periods[i - 1].last + 1 : 0, end.last, end.firstDay)),
    ends: periods.map((end) => end.last),
  };
}

/** The index of the frame that holds `day` (frames oldest first); the last when `day` is past them all. */
export function periodIndexOf(runs, day) {
  const i = runs.findIndex((run) => run.day >= day);
  return i < 0 ? runs.length - 1 : i;
}
