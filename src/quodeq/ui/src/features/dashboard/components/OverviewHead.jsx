import FindingsHead from '../../../components/FindingsHead.jsx';
import TrendBadge from '../../../components/TrendBadge.jsx';
import SharedReadOnlyBadge from '../../../components/SharedReadOnlyBadge.jsx';
import { scopeMetrics, tileChanges } from '../../../models/findingMetrics.js';
import { scoreChangeShows } from '../../../utils/trendUtils.js';
import { heroCardHandlers } from './heroSectionParts.jsx';
import { overviewSub } from '../overviewHeadModel.js';
import { useRunModel } from '../hooks/useOverviewPeriod.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { t } from '../../../strings/index.js';

/** Beside the title: the score's trend (none under 0.05), and the shared badge on a shared project. */
function HeadBadge({ delta, shared, publishedBy }) {
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
 */
export default function OverviewHead({ data, accumulated, stats, headline, previous, deltas, pastRun, onCardNavigate }) {
  const summary = accumulated?.summary || {};
  const dimensions = accumulated?.dimensions || [];
  const shared = data.selectedSource === PROJECT_SOURCE.SHARED;
  const model = useRunModel({ project: data.selectedProject, source: data.selectedSource, runId: stats.lastRun?.runId });
  const metrics = projectMetrics(summary, headline);
  const handlers = heroCardHandlers(onCardNavigate, { violations: metrics.violations, compliance: metrics.compliance });
  return (
    <FindingsHead
      title={data.projectInfo?.displayName || data.projectInfo?.name || t('overview.termName')}
      sub={overviewSub({ projectInfo: data.projectInfo, lastDate: stats.lastRun?.date, model, dimensions })}
      grade={{ score: summary.numericAverage, insufficient: false, hint: data.customFormula ? t('overview.customFormulaNote') : null }}
      badge={<HeadBadge delta={stats.scoreDelta} shared={shared} publishedBy={data.projectInfo?.publishedBy} />}
      metrics={metrics} filesHint={t('overview.per100Hint', { count: dimensions.length })}
      deltas={deltas || undefined} changes={tileChanges(metrics, previous)} pastRun={pastRun}
      actions={{ onViolations: handlers.handleViolations, onCompliance: handlers.handleCompliance, onSeverity: handlers.handleSeverity }}
    />
  );
}
