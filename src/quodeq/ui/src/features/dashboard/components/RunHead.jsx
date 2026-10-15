import FindingsHead from '../../../components/FindingsHead.jsx';
import { HeadBadge } from './OverviewHead.jsx';
import { heroCardHandlers } from './heroSectionParts.jsx';
import buildRunSummary from '../buildRunSummary.js';
import { dimensionsMetrics } from '../overviewHeadModel.js';
import { runTitle, runSub, runMetrics, severityChanges, scoreChange } from '../runPageModel.js';
import { tileChanges } from '../../../models/findingMetrics.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { t } from '../../../strings/index.js';

/**
 * Under the title: that a grade formula change rescored the run without a
 * new scan, and how many of its findings were suppressed (dismissed or
 * deleted); nothing when neither.
 */
function RunNotes({ formulaUpdated, suppressed }) {
  return (
    <>
      {formulaUpdated && <span title={t('overview.formulaUpdatedTitle')}>{t('overview.formulaUpdatedNote')}</span>}
      {formulaUpdated && suppressed > 0 && t('violations.wbDot')}
      {suppressed > 0 && <span>{t('overview.runSuppressed', { count: suppressed })}</span>}
    </>
  );
}

/**
 * The run page's header, the Overview's for one run: the run's ring, grade
 * word and score change, when it ran (the title), where it came from, the
 * model, commit, duration and files analysed, and its numbers (violations,
 * pass rate, per 100 files read averaged over the dimensions, critical per
 * 1,000) with their changes since the run it was compared with; the
 * violations, pass rate and severities open the run's findings, read-only.
 * @param {object} props
 * @param {object} props.dashboard the run's dashboard (dimensions, selectedRun)
 * @param {object} props.comparison useRunComparison output
 * @param {?object} props.projectInfo
 * @param {string} props.source a PROJECT_SOURCE value
 * @param {boolean} [props.formulaUpdated]
 * @param {?Function} props.onCardNavigate
 */
export default function RunHead({ dashboard, comparison, projectInfo, source, formulaUpdated = false, onCardNavigate }) {
  const dims = dashboard.dimensions || [];
  const summary = buildRunSummary(dims);
  const metrics = dimensionsMetrics(dims);
  const previous = runMetrics(comparison.previousDims);
  const handlers = heroCardHandlers(onCardNavigate, { violations: metrics.violations, compliance: metrics.compliance });
  const suppressed = summary.suppressed || 0;
  return (
    <FindingsHead
      title={runTitle(dashboard.selectedRun, comparison.run?.startedAt)}
      sub={runSub({ run: comparison.run, selectedRun: dashboard.selectedRun })}
      grade={{ score: summary.numericAverage, insufficient: false, hint: formulaUpdated || suppressed > 0 ? <RunNotes formulaUpdated={formulaUpdated} suppressed={suppressed} /> : null }}
      badge={<HeadBadge delta={scoreChange(dims, comparison.previousDims)} shared={source === PROJECT_SOURCE.SHARED} publishedBy={projectInfo?.publishedBy} />}
      metrics={metrics} filesHint={t('overview.per100Hint', { count: dims.length })}
      deltas={severityChanges(metrics, previous) || undefined} changes={tileChanges(metrics, previous)}
      actions={{ onViolations: handlers.handleViolations, onCompliance: handlers.handleCompliance, onSeverity: handlers.handleSeverity }}
    />
  );
}
