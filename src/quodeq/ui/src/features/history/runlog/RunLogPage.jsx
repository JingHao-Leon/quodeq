import { useCallback, useMemo, useRef, useState } from 'react';
import PageToolbar from '../../../components/PageToolbar.jsx';
import SharedReadOnlyBadge from '../../../components/SharedReadOnlyBadge.jsx';
import { LoadProjectFailedEmptyState } from '../../../components/ProjectEmptyStates.jsx';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';
import { useRunLog, useSharedRunLog } from './useRunLog.js';
import { useRunThroughput } from './useRunDetail.js';
import { useRunDiff } from '../../../hooks/useRunDiff.js';
import { useHistorySelection } from './useHistorySelection.js';
import { useKeyboardSelect } from './useKeyboardSelect.js';
import { findingParams, dimensionParams, runStamp } from './runLogNavigation.js';
import { countBy } from './runLogModel.js';
import { runsForVisibleStandards } from './runVisibility.js';
import { useRunFilters } from './useRunFilters.js';
import RunFilters from './RunFilters.jsx';
import RunningLine from './RunningLine.jsx';
import RunLogBody from './RunLogBody.jsx';
import RunDetail from './RunDetail.jsx';
import RunLogSkeleton from './RunLogSkeleton.jsx';

const NAV_FINDING = 'finding';
const SMALL_SCREEN = '(max-width: 900px)';

const isSmallScreen = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(SMALL_SCREEN).matches);

function headerSub(runs) {
  const models = countBy(runs, 'model').length;
  // A remote project's log (built from the trend) knows no models.
  return [
    t(pluralKey(runs.length, 'history.runsCountOne', 'history.runsCountMany'), { count: runs.length }),
    models > 0 ? t(pluralKey(models, 'history.modelsCountOne', 'history.modelsCountMany'), { count: models }) : null,
  ].filter(Boolean).join(' · ');
}

/** Selection, strip window and small-screen scroll: one place picks a run. */
function useRunPicker({ rows, initialRunId, onRunChange, pageRef }) {
  const { selected, select, tab, setTab } = useHistorySelection({ initialRunId, onRunChange, rows });
  const [stripStart, setStripStart] = useState(null); // null = follow the selection
  const pick = useCallback((id) => { select(id); setStripStart(null); }, [select]);
  // On a small screen the run panel sits above the list: bring it into view.
  const pickFromList = useCallback((id) => {
    pick(id);
    if (isSmallScreen()) pageRef.current?.querySelector('.rl-detail')?.scrollIntoView({ block: 'start' });
  }, [pick, pageRef]);
  return { selected, tab, setTab, pick, pickFromList, stripStart, setStripStart };
}

function useRunActions({ selected, runsById, callbacks, refetch }) {
  const { onRunClick, onDimensionClick, onNavigate, onDeleteRun } = callbacks;
  // A report-only run has nothing to restore, so the opening gate must not say "restoring".
  const openRun = useCallback((run) => onRunClick?.(run.runId, runStamp(run), { archived: Boolean(run.archived && !run.cold) }), [onRunClick]);
  const openFinding = (finding, inRun, resolvedIn) => onNavigate?.(NAV_FINDING, findingParams({ finding, selected, inRun, resolvedIn }));
  const openDimension = (dim) => onDimensionClick?.(dimensionParams(dim, selected));
  // The log drops the run on its next read; read it now rather than in 10 s.
  const deleteRun = onDeleteRun
    ? async (runId, label) => { await onDeleteRun(runId, label); refetch(); }
    : undefined;
  const baseline = selected?.baselineRunId ? runsById.get(selected.baselineRunId) || null : null;
  return { openRun, openFinding, openDimension, deleteRun, baseline };
}

/**
 * A remote project has no run log endpoint: its log comes from the trend,
 * which arrives already narrowed to the visible standards. The local log is
 * narrowed here.
 */
function usePageLog({ project, shared, trend, partialRuns, visibleSet }) {
  const localLog = useRunLog(shared ? null : project);
  const sharedLog = useSharedRunLog(shared ? trend : null, partialRuns);
  const localRuns = useMemo(() => runsForVisibleStandards(localLog.runs, visibleSet), [localLog.runs, visibleSet]);
  return shared ? sharedLog : { ...localLog, runs: localRuns };
}

function NoRunsYet({ loading, error, onRetry }) {
  if (loading) return <RunLogSkeleton />;
  return <LoadProjectFailedEmptyState error={error?.message || String(error)} onRetry={onRetry} />;
}

function RunLogFrame({ runs, shared, refreshing, filters, pageRef, children }) {
  return (
    <div ref={pageRef} className={`history-page history-page--terminal rl${refreshing ? ' section-pending' : ''}`}>
      <PageToolbar title={t('history.termName')} className="rl-top" facts={headerSub(runs)} badge={shared ? <SharedReadOnlyBadge /> : null}>{filters}</PageToolbar>
      {children}
    </div>
  );
}

/**
 * History as a run log: the runs newest first, what changed in each against
 * its comparison run, and the selected run beside the list.
 */
export default function RunLogPage({ project, shared = false, trend, partialRuns, visibleSet = null, refreshing = false, initialRunId, onRunChange, ...callbacks }) {
  const pageRef = useRef(null);
  const { runs, running, loading, error, refetch } = usePageLog({ project, shared, trend, partialRuns, visibleSet });
  const runsById = useMemo(() => new Map(runs.map((r) => [r.runId, r])), [runs]);
  const filters = useRunFilters(runs, project);
  const { rows } = filters;
  const picker = useRunPicker({ rows, initialRunId, onRunChange, pageRef });
  const { selected } = picker;
  const diff = useRunDiff(project, selected);
  const throughput = useRunThroughput(selected?.jobId);
  const actions = useRunActions({ selected, runsById, callbacks, refetch });
  useKeyboardSelect(rows, selected?.runId, picker.pick, actions.openRun);

  const frame = { runs, shared, refreshing, pageRef };
  if (!runs.length && (loading || error)) {
    return <RunLogFrame {...frame}><NoRunsYet loading={loading} error={error} onRetry={refetch} /></RunLogFrame>;
  }
  const filterBar = (
    <RunFilters rows={runs} origin={filters.origin} model={filters.model} onOrigin={filters.setOrigin} onModel={filters.setModel} shown={rows.length} />
  );
  // Built here, so a hover (state inside RunLogBody) does not re-render it.
  const detail = selected && (
    <RunDetail run={selected} baseline={actions.baseline} diff={diff} throughput={throughput}
      tab={picker.tab} onTab={picker.setTab} onOpenRun={actions.openRun} onOpenFinding={actions.openFinding}
      onOpenDimension={actions.openDimension} onDelete={actions.deleteRun} />
  );
  return (
    <RunLogFrame {...frame} filters={filterBar}>
      <RunningLine job={running} onNavigate={callbacks.onNavigate} />
      <RunLogBody project={project} shared={shared} rows={rows} selectedId={selected?.runId}
        onPick={picker.pick} onPickFromList={picker.pickFromList} stripStart={picker.stripStart} onPage={picker.setStripStart}
        onClearFilters={filters.active ? filters.clear : undefined} detail={detail} />
    </RunLogFrame>
  );
}
