import FindingsHead from '../../../components/FindingsHead.jsx';
import TrendBadge from '../../../components/TrendBadge.jsx';
import SharedReadOnlyBadge from '../../../components/SharedReadOnlyBadge.jsx';
import { scopeMetrics, tileChanges } from '../../../models/findingMetrics.js';
import { scoreChangeShows } from '../../../utils/trendUtils.js';
import { headActions } from './heroSectionParts.jsx';
import { partialDimensionCount } from '../overviewHeadModel.js';
import { extDisplayName } from '../../../utils/formatters.js';
import { pluralKey } from '../../../utils/plural.js';
import { useRunModel } from '../hooks/useOverviewPeriod.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { t, LOCALE } from '../../../strings/index.js';
import { relativeTime } from '../../../utils/relativeTime.js';

const MAX_LANGS_IN_SUB = 5;
const LANGS_SEP = '  ';
const SIZE_SEP = '  ·  ';

/** The project's size first ("3,925 files"), then its top languages; null when neither is known. */
export function languageSub(projectInfo) {
  const files = projectInfo?.filesCount;
  const total = files != null ? t('overview.filesTotal', { count: files.toLocaleString(LOCALE) }) : null;
  const stats = projectInfo?.languageStats;
  const sorted = stats ? Object.entries(stats).sort(([, a], [, b]) => b - a).slice(0, MAX_LANGS_IN_SUB) : [];
  const langs = sorted.map(([lang, count]) => `${count} ${extDisplayName(lang).toLowerCase()}`).join(LANGS_SEP);
  if (!total) return langs || null;
  return langs ? `${total}${SIZE_SEP}${langs}` : total;
}

/**
 * The Overview's sub line, as the other pages': what it is (the project's
 * files and languages), when and by which model it was last evaluated, and
 * a warning only when a dimension's files read round below 100%, and for
 * a shared project when its copy was last fetched.
 * @param {{projectInfo?: object, lastDate?: ?string, model?: ?string, dimensions?: object[]}} args
 * @returns {?string}
 */
export function overviewSub({ projectInfo, lastDate = null, model = null, dimensions = [] }) {
  const partial = partialDimensionCount(dimensions);
  // A shared project's copy is as fresh as its last fetch: say when that was.
  const fetched = projectInfo?.lastFetchedAt ? relativeTime(projectInfo.lastFetchedAt) : null;
  return [
    languageSub(projectInfo),
    lastDate ? t('overview.subEvaluated', { date: lastDate }) : null,
    model ? t('overview.subModel', { model }) : null,
    partial ? t(pluralKey(partial, 'overview.subPartialOne', 'overview.subPartial'), { count: partial }) : null,
    fetched ? t('overview.subFetched', { when: fetched }) : null,
  ].filter(Boolean).join(t('violations.wbDot')) || null;
}

/** Beside the title: the score's trend (none under 0.05), and the shared badge on a shared project. */
export function HeadBadge({ delta, shared, publishedBy }) {
  const trend = scoreChangeShows(delta) ? <TrendBadge delta={delta} /> : null;
  if (!trend && !shared) return null;
  return <>{trend}{shared ? <SharedReadOnlyBadge publishedBy={publishedBy} /> : null}</>;
}

/** The project's numbers as the tiles read them: its findings over the files its dimensions read. */
function projectMetrics(summary, headline) {
  return scopeMetrics({
    sevCounts: summary.severity || {}, total: summary.totalViolations || 0, compliance: summary.totalCompliance || 0, files: headline.filesRead || 0,
  });
}

/**
 * The Overview's header, the dimension page's one level up: the project's
 * ring, grade word and trend, its make-up and when and by which model it
 * was evaluated, and its numbers (violations, pass rate, per 100 files read
 * averaged over the dimensions, critical per 1,000) with their changes since
 * the previous period; the violations, pass rate and severities open the
 * project's findings. A past run on show says so, with the way back.
 * @param {object} props
 * @param {object} props.data the dashboard data (project, source, info, custom formula)
 * @param {?object} props.accumulated the accumulated scores of the dimensions on show
 * @param {{scoreDelta: *, lastRun: {date: ?string, runId: ?string}}} props.stats
 * @param {object} props.headline buildHeadline output (files read)
 * @param {?object} props.previous the previous period's scopeMetrics
 * @param {?object} props.deltas the severities' change since the previous period
 * @param {?{when: string, onBack: Function}} props.pastRun
 * @param {?Function} props.onCardNavigate
 * @param {React.ReactNode} [props.since] what changed since the previous period, under the sub line
 */
export default function OverviewHead({ data, accumulated, stats, headline, previous, deltas, pastRun, onCardNavigate, since = null }) {
  const summary = accumulated?.summary || {};
  const dimensions = accumulated?.dimensions || [];
  const shared = data.selectedSource === PROJECT_SOURCE.SHARED;
  const model = useRunModel({ project: data.selectedProject, source: data.selectedSource, runId: stats.lastRun?.runId });
  const metrics = projectMetrics(summary, headline);
  return (
    <FindingsHead
      title={data.projectInfo?.displayName || data.projectInfo?.name || t('overview.termName')}
      sub={overviewSub({ projectInfo: data.projectInfo, lastDate: stats.lastRun?.date, model, dimensions })}
      grade={{ score: summary.numericAverage, insufficient: false, hint: data.customFormula ? t('overview.customFormulaNote') : null }}
      badge={<HeadBadge delta={stats.scoreDelta} shared={shared} publishedBy={data.projectInfo?.publishedBy} />}
      metrics={metrics} filesHint={t('overview.per100Hint', { count: dimensions.length })}
      deltas={deltas || undefined} changes={tileChanges(metrics, previous)} pastRun={pastRun} since={since}
      actions={headActions(onCardNavigate, metrics)}
    />
  );
}
