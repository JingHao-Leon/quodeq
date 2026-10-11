import { useCallback, useMemo, useRef, useState } from 'react';
import { TermHeader } from '../../../components/terminal/index.js';
import SharedReadOnlyBadge from '../../../components/SharedReadOnlyBadge.jsx';
import { LoadProjectFailedEmptyState } from '../../../components/ProjectEmptyStates.jsx';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';
import { useRunLog } from './useRunLog.js';
import { useRunDiff, useRunThroughput } from './useRunDetail.js';
import { useHistorySelection } from './useHistorySelection.js';
import { useKeyboardSelect } from './useKeyboardSelect.js';
import { findingParams, dimensionParams, runStamp } from './runLogNavigation.js';
import { countBy, originLabel } from './runLogModel.js';
import RunFilters, { FILTER_ALL } from './RunFilters.jsx';
import RunningLine from './RunningLine.jsx';
import ChangeStrip from './ChangeStrip.jsx';
import RunList from './RunList.jsx';
import RunDetail from './RunDetail.jsx';
import RunLogSkeleton from './RunLogSkeleton.jsx';

const NAV_FINDING = 'finding';
const SMALL_SCREEN = '(max-width: 900px)';

const isSmallScreen = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(SMALL_SCREEN).matches);

function headerSub(runs) {
  const models = countBy(runs, 'model').length;
  return [
    t(pluralKey(runs.length, 'history.runsCountOne', 'history.runsCountMany'), { count: runs.length }),
    t(pluralKey(models, 'history.modelsCountOne', 'history.modelsCountMany'), { count: models }),
  ].join(' · ');
}

/** Origin and model filters over the full log; `rows` is what survives them. */
function useRunFilters(runs) {
  const [origin, setOrigin] = useState(FILTER_ALL);
  const [model, setModel] = useState(FILTER_ALL);
  const rows = useMemo(() => runs.filter((r) => (
    (origin === FILTER_ALL || originLabel(r.origin) === origin) && (model === FILTER_ALL || r.model === model)
  )), [runs, origin, model]);
  return { rows, origin, model, setOrigin, setModel };
}

/** Selection, strip window and small-screen scroll: one place picks a run. */
function useRunPicker({ rows, initialRunId, onRunChange, pageRef }) {
  const { selected, select, tab, setTab } = useHistorySelection({ initialRunId, onRunChange, rows });
  const [stripStart, setStripStart] = useState(null); // null = follow the selection
  const [hoverId, setHoverId] = useState(null);
  const pick = useCallback((id) => { select(id); setStripStart(null); }, [select]);
  // On a small screen the run panel sits above the list: bring it into view.
  const pickFromList = useCallback((id) => {
    pick(id);
    if (isSmallScreen()) pageRef.current?.querySelector('.rl-detail')?.scrollIntoView({ block: 'start' });
  }, [pick, pageRef]);
  return { selected, tab, setTab, pick, pickFromList, stripStart, setStripStart, hoverId, setHoverId };
}

function useRunActions({ selected, runsById, callbacks, refetch }) {
  const { onRunClick, onDimensionClick, onNavigate, onDeleteRun } = callbacks;
  const openRun = useCallback((run) => onRunClick?.(run.runId, runStamp(run)), [onRunClick]);
  const openFinding = (finding, inRun, resolvedIn) => onNavigate?.(NAV_FINDING, findingParams({ finding, selected, inRun, resolvedIn }));
  const openDimension = (dim) => onDimensionClick?.(dimensionParams(dim, selected));
  // The log drops the run on its next read; read it now rather than in 10 s.
  const deleteRun = onDeleteRun
    ? async (runId, label) => { await onDeleteRun(runId, label); refetch(); }
    : undefined;
  const baseline = selected?.baselineRunId ? runsById.get(selected.baselineRunId) || null : null;
  return { openRun, openFinding, openDimension, deleteRun, baseline };
}

function RunLogFrame({ runs, shared, refreshing, filters, pageRef, children }) {
  return (
    <div ref={pageRef} className={`history-page history-page--terminal rl${refreshing ? ' section-pending' : ''}`}>
      <div className="term-page-top rl-top">
        <TermHeader name={t('history.termName')} sub={headerSub(runs)} badge={shared ? <SharedReadOnlyBadge /> : null} />
        {filters}
      </div>
      {children}
    </div>
  );
}

/**
 * History as a run log: the runs newest first, what changed in each against
 * its comparison run, and the selected run beside the list.
 */
export default function RunLogPage({ project, shared = false, refreshing = false, initialRunId, onRunChange, ...callbacks }) {
  const pageRef = useRef(null);
  const { runs, running, loading, error, refetch } = useRunLog(project);
  const runsById = useMemo(() => new Map(runs.map((r) => [r.runId, r])), [runs]);
  const filters = useRunFilters(runs);
  const { rows } = filters;
  const picker = useRunPicker({ rows, initialRunId, onRunChange, pageRef });
  const { selected } = picker;
  const diff = useRunDiff(project, selected);
  const throughput = useRunThroughput(selected?.jobId);
  const actions = useRunActions({ selected, runsById, callbacks, refetch });
  useKeyboardSelect(rows, selected?.runId, picker.pick, actions.openRun);

  const frame = { runs, shared, refreshing, pageRef };
  if (!runs.length && (loading || error)) {
    return (
      <RunLogFrame {...frame}>
        {loading ? <RunLogSkeleton /> : <LoadProjectFailedEmptyState error={error?.message || String(error)} onRetry={refetch} />}
      </RunLogFrame>
    );
  }
  const filterBar = (
    <RunFilters rows={runs} origin={filters.origin} model={filters.model} onOrigin={filters.setOrigin} onModel={filters.setModel} shown={rows.length} />
  );
  return (
    <RunLogFrame {...frame} filters={filterBar}>
      <RunningLine job={running} onNavigate={callbacks.onNavigate} />
      <ChangeStrip rows={rows} selectedId={selected?.runId} onSelect={picker.pick} hoverId={picker.hoverId}
        onHover={picker.setHoverId} start={picker.stripStart} onPage={picker.setStripStart} />
      <div className="rl-split">
        <RunList rows={rows} runsById={runsById} selectedId={selected?.runId} onSelect={picker.pickFromList}
          hoverId={picker.hoverId} onHover={picker.setHoverId} />
        {selected && (
          <RunDetail run={selected} baseline={actions.baseline} diff={diff} throughput={throughput}
            tab={picker.tab} onTab={picker.setTab} onOpenRun={actions.openRun} onOpenFinding={actions.openFinding}
            onOpenDimension={actions.openDimension} onDelete={actions.deleteRun} />
        )}
      </div>
    </RunLogFrame>
  );
}
