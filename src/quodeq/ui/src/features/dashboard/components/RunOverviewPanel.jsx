import { withPending } from '../../../utils/pendingClass.js';
import { useMemo } from 'react';
import LoadingScreen from '../../../components/LoadingScreen.jsx';
import TopOffendingFilesTable from '../../../components/TopOffendingFilesTable.jsx';
import DimensionGaugeCard from './DimensionGaugeCard.jsx';
import { SectionLabel } from '../../../components/terminal/index.js';

import { t } from '../../../strings/index.js';
import { RunHeroSection } from './RunHeroSection.jsx';
import { chipDeltas } from '../headlineStats.js';
import { buildRunViewData } from '../runViewData.js';
import { useRunReportSpecs } from './runReportSpecs.jsx';
import { useRunFindings } from '../hooks/useRunFindings.js';
import { SCOPE_KIND, openScope, cardFilter } from '../../violations/scope/scopeModel.js';
import { runAsOf } from '../../violations/asOf.js';
import { EVIDENCE_CONFIDENCE } from '../../../vocab/evidenceConfidence.js';

export { RunHeroSection };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunDimensionsGrid({ dimensions, selectedRunId, dateLabel, onDimensionClick, trendDeltas }) {
  const sorted = useMemo(
    () => [...dimensions].sort((a, b) => a.dimension.localeCompare(b.dimension)),
    [dimensions]
  );
  return (
    <div className="dimensions-grid">
      {sorted.map((item) => (
        <DimensionGaugeCard
          key={item.dimension}
          item={item}
          delta={trendDeltas?.[(item.dimension || '').toLowerCase()] ?? null}
          onDimensionClick={onDimensionClick}
          selectedRunId={selectedRunId}
          dateLabel={dateLabel}
          thinEvidence={item.confidence === EVIDENCE_CONFIDENCE.LOW}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run-specific overview panel
// ---------------------------------------------------------------------------

function RunFileViolations({ runTopFiles, onFileClick }) {
  if (runTopFiles.length === 0) return null;
  return (
    <section className="qd-cards-panel offending-panel" aria-label={t('overview.violationsByFileAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('overview.violationsByFileLabel')} · {runTopFiles.length}</SectionLabel>
        <span className="run-history-panel__stats">{t('overview.sortedBySeverity')}</span>
      </div>
      <TopOffendingFilesTable files={runTopFiles} onFileClick={onFileClick} />
    </section>
  );
}

// Per-dimension deltas from the trend entry (same source the history rows use)
function useTrendDeltas(dashboard) {
  return useMemo(() => {
    const currentRunId = dashboard?.selectedRun?.runId;
    const entry = (dashboard?.trend || []).find((item) => item.runId === currentRunId);
    if (!entry?.dimensionDetails) return {};
    const lookup = {};
    for (const d of entry.dimensionDetails) {
      if (d.delta != null) lookup[(d.dimension || '').toLowerCase()] = d.delta;
    }
    return lookup;
  }, [dashboard]);
}

// A chosen run's findings open as scoped Findings views as of that run,
// read-only: the hero cards the project on their filter, a file row the file.
function useRunScopeNavigate({ asOf, onNavigate }) {
  return useMemo(() => {
    if (!onNavigate) return {};
    return {
      onCardNavigate: (kind) => openScope(onNavigate, { kind: SCOPE_KIND.PROJECT, filter: cardFilter(kind) }, asOf),
      onFileClick: (f) => openScope(onNavigate, { kind: SCOPE_KIND.FILE, path: f.file }, asOf),
    };
  }, [onNavigate, asOf]);
}

// The run's derived view data: summary, worst files, hero-card navigation and
// the per-dimension deltas; also registers this run's report specs. The
// dashboard is the overview shape (scores and counts); the finding lists the
// worst files, navigation, report and fix plan need come from the run's
// scores query and are merged in by dimension.
function useRunOverviewModel({ dashboard, selectedRunId, selectedProject, selectedSource, availableRuns, projectName, onNavigate }) {
  const runId = dashboard?.selectedRun?.runId || selectedRunId;
  const findings = useRunFindings({ project: selectedProject, runId, source: selectedSource, availableRuns, enabled: !!dashboard?.dimensions });
  const { dimensions, runSummary, since, runTopFiles, headline } = useMemo(
    () => buildRunViewData(dashboard, findings.dimensions),
    [dashboard, findings.dimensions],
  );
  const asOf = useMemo(() => runAsOf(runId, dashboard?.selectedRun?.dateISO), [runId, dashboard?.selectedRun?.dateISO]);
  const { onCardNavigate, onFileClick } = useRunScopeNavigate({ asOf, onNavigate });
  const reportDashboard = useMemo(() => (dashboard ? { ...dashboard, dimensions } : dashboard), [dashboard, dimensions]);
  useRunReportSpecs({ dashboard: reportDashboard, runSummary, selectedRunId, projectName, headline, since });
  const trendDeltas = useTrendDeltas(dashboard);
  return { runSummary, runTopFiles, onCardNavigate, onFileClick, trendDeltas, since, headline };
}

export default function RunOverviewPanel({
  dashboard, selectedRunId, selectedProject, selectedSource, availableRuns, projectName,
  onDimensionClick, onNavigate, refreshing = false, formulaUpdated = false,
}) {
  const { runSummary, runTopFiles, onCardNavigate, onFileClick, trendDeltas, since, headline } = useRunOverviewModel({
    dashboard, selectedRunId, selectedProject, selectedSource, availableRuns, projectName, onNavigate,
  });

  const isLoading = !dashboard || !dashboard.dimensions;
  if (isLoading) {
    return (
      <div className="run-overview-fade run-overview-loading">
        <div className="run-overview-spinner"><LoadingScreen variant="inline" /></div>
      </div>
    );
  }
  const dimCount = (dashboard?.dimensions || []).length;

  return (
    <div className={withPending('run-overview-fade run-overview-ready', refreshing)} aria-busy={refreshing || undefined}>
      <RunHeroSection dashboard={dashboard} selectedRunId={selectedRunId} runSummary={runSummary} onCardNavigate={onCardNavigate} deltas={chipDeltas(since)} density={headline.density} formulaUpdated={formulaUpdated} />
      <section className="quality-dimensions" aria-label={t('overview.qualityDimensionsAria')}>
        <div className="quality-dimensions__head">
          <SectionLabel>{t('overview.qualityDimensionsLabel')} · {dimCount}</SectionLabel>
        </div>
        <div className="dimensions-panel">
          <RunDimensionsGrid dimensions={dashboard?.dimensions || []} selectedRunId={selectedRunId} dateLabel={dashboard?.selectedRun?.dateLabel} onDimensionClick={onDimensionClick} trendDeltas={trendDeltas} />
        </div>
      </section>
      <RunFileViolations runTopFiles={runTopFiles} onFileClick={onFileClick} />
    </div>
  );
}
