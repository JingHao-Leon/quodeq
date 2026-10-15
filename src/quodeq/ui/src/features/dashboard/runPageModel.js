/**
 * What the run page (History, "open run") reads off one run and the run it
 * was compared with (the run log's baseline, the same one History counts
 * new and fixed findings against): its title and sub line, the tiles'
 * numbers and their change, each dimension's score change, and the run
 * diff folded for the since line and the cards' footers. Pure functions,
 * no framework imports.
 */
import { t, LOCALE } from '../../strings/index.js';
import { formatRunWhen, formatDurationCoarse } from '../../utils/dateFormatting.js';
import { originLabel } from '../../models/runOrigin.js';
import { summariseDiff } from '../../models/runDiff.js';
import { sinceSummary } from '../../models/sinceSummary.js';
import { SEVERITY_ORDER } from '../../vocab/severity.js';
import { nameKey } from '../../utils/nameKey.js';
import { dimensionsMetrics } from './overviewHeadModel.js';

// A commit as the run log shows it: its first seven characters.
const SHORT_SHA = 7;
// A narrow header wraps its title and sub line at their dots, never inside a
// part ("Sun 4 Oct", "took 2h 46m", "668 files"): every other space holds.
const SPACE_INSIDE_A_PART = /(?<!·) (?!·)/g;
const NO_BREAK_SPACE = '\u00a0';
const keepTogether = (text) => text.replace(SPACE_INSIDE_A_PART, NO_BREAK_SPACE);
const NO_DIMENSIONS = [];

const scoreOf = (d) => parseFloat(d?.overallScore);
const graded = (n) => !Number.isNaN(n);

/**
 * The page's title: "run · Thu 8 Oct · 08:23", when it ran as a person
 * reads it (the run's day label when its time is unknown), wrapping only at its dots.
 * @param {?{dateISO?: string, dateLabel?: string}} selectedRun the dashboard's
 * @param {?string} startedAt the run log's start, when the dashboard has no time
 */
export function runTitle(selectedRun, startedAt = null) {
  const when = formatRunWhen(selectedRun?.dateISO || startedAt, selectedRun?.dateLabel || '');
  return t('overview.runTitle', { when: keepTogether(when) });
}

/** "took 1h 23m", or null without a duration. */
function tookText(run) {
  return run?.activeSeconds > 0 ? t('history.idTookValue', { value: formatDurationCoarse(run.activeSeconds) }) : null;
}

/** "346 files" (the files the run analysed, cached ones left out), or null when unknown. */
function filesText(run) {
  return run?.filesAnalysed > 0 ? t('history.idFilesValue', { count: run.filesAnalysed.toLocaleString(LOCALE) }) : null;
}

/** The run's commit: the run log's, else the dashboard's, shortened. */
function commitText(run, selectedRun) {
  return run?.commit || selectedRun?.commitSha?.slice(0, SHORT_SHA) || null;
}

/**
 * The sub line: where the run came from, the model, the commit, how long
 * it took and how many files it analysed, as History's run panel shows
 * them; what is unknown is left out (a shared project has no run log).
 * @param {{run: ?object, selectedRun: ?object}} args the run log entry and the dashboard's selected run
 * @returns {?string}
 */
export function runSub({ run, selectedRun }) {
  return [originLabel(run?.origin), run?.model, commitText(run, selectedRun), tookText(run), filesText(run)]
    .filter(Boolean).map(keepTogether).join(t('violations.wbDot')) || null;
}

/**
 * A run's numbers as the header tiles read them; null without dimensions.
 * @param {?object[]} dims the run's dimensions (the dashboard's)
 */
export function runMetrics(dims) {
  return dims?.length ? dimensionsMetrics(dims) : null;
}

/**
 * Each severity's change since the previous run, for the Violations tile's
 * badges; null without a previous run.
 * @param {object} now runMetrics output
 * @param {?object} previous runMetrics output
 * @returns {?Object<string, number>}
 */
export function severityChanges(now, previous) {
  if (!previous) return null;
  return Object.fromEntries(SEVERITY_ORDER.map((level) => [level, (now.sevCounts[level] || 0) - (previous.sevCounts[level] || 0)]));
}

/** The dimensions' mean score; NaN with none graded. */
function meanScore(dims) {
  const scores = (dims || []).map(scoreOf).filter(graded);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : NaN;
}

/**
 * The run's score change since the previous run (the mean of its
 * dimensions' scores against the previous run's); null when either is unknown.
 * @param {?object[]} dims
 * @param {?object[]} previousDims
 */
export function scoreChange(dims, previousDims) {
  const delta = meanScore(dims) - meanScore(previousDims);
  return graded(delta) ? delta : null;
}

/**
 * Each dimension's score change since the previous run, by lowercase name,
 * as the Overview's cards and since line read them (`{delta}`, null when
 * either run has no score for it, or there is no previous run).
 * @param {?object[]} dims
 * @param {?object[]} previousDims
 * @returns {Object<string, {delta: ?number}>}
 */
export function runDimensionTrends(dims, previousDims) {
  const before = new Map((previousDims || NO_DIMENSIONS).map((d) => [nameKey(d.dimension), scoreOf(d)]));
  return Object.fromEntries((dims || NO_DIMENSIONS).map((d) => {
    const delta = scoreOf(d) - (before.has(nameKey(d.dimension)) ? before.get(nameKey(d.dimension)) : NaN);
    return [nameKey(d.dimension), { delta: graded(delta) ? delta : null }];
  }));
}

const keepEvery = () => true;

/**
 * The run diff against the previous run, as the run page reads it: each
 * dimension's new and fixed findings (summariseDiff's `perDim`, keyed by
 * lowercase name) and the since line's summary (sinceSummary).
 * @param {object} payload the run diff payload
 * @returns {{perDim: Object<string, object>, since: ?object}}
 */
export function runChangeView(payload) {
  const perDim = summariseDiff(payload)?.perDim || {};
  return {
    perDim: Object.fromEntries(Object.entries(perDim).map(([name, change]) => [nameKey(name), change])),
    since: sinceSummary([payload], keepEvery),
  };
}
