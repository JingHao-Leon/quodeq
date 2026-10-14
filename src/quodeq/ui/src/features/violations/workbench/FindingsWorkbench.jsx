/**
 * The Violations findings workbench: the search and filter bar over one flat
 * list of findings (open and dismissed), and the selected finding's detail.
 */
import { useCallback, useMemo, useRef } from 'react';
import { FINDING_GROUP, FINDING_STATUS } from '../violationsVocab.js';
import { applyFilters, flattenFindings, groupFindings, statusPool } from './workbenchModel.js';
import { collapseSingle, folderLevel, parentFolder } from './folderModel.js';
import { useWorkbenchState } from './useWorkbenchState.js';
import { useSelection } from './useSelection.js';
import { useWorkbenchKeys } from './useWorkbenchKeys.js';
import WorkbenchBar from './WorkbenchBar.jsx';
import FindingList from './FindingList.jsx';
import FindingDetail from './FindingDetail.jsx';
import DismissedBulk from './DismissedBulk.jsx';
import { useSplitWidth } from '../hooks/useSplitWidth.js';
import SplitDivider, { splitColumns } from '../components/SplitDivider.jsx';
import CardListSkeleton from '../../../components/CardListSkeleton.jsx';

const FOLDER_END = '/';
const KEY_SEP = '|';

function openByDimension(findings) {
  const m = new Map();
  findings.forEach((f) => { if (f.status === FINDING_STATUS.OPEN) m.set(f.dimension, (m.get(f.dimension) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function statusCountsOf(findings, { severity, dimension }) {
  const pool = findings.filter((f) => (!severity || f.severity === severity) && (!dimension || f.dimension === dimension));
  const dismissed = pool.filter((f) => f.status === FINDING_STATUS.DISMISSED).length;
  return { [FINDING_STATUS.OPEN]: pool.length - dismissed, [FINDING_STATUS.DISMISSED]: dismissed, [FINDING_STATUS.ALL]: pool.length };
}

/** The list the screen shows: grouped, or one folder level when browsing folders. */
function useView(all, state) {
  const folders = state.group === FINDING_GROUP.FOLDERS;
  const dir = folders ? (state.paths.find((p) => p.endsWith(FOLDER_END)) || '') : '';
  const list = useMemo(() => applyFilters(all, state), [all, state]);
  const unpathed = useMemo(() => (folders ? applyFilters(all, { ...state, paths: [] }) : null), [folders, all, state]);
  const level = useMemo(() => (folders ? folderLevel(unpathed, dir) : null), [folders, unpathed, dir]);
  const groups = useMemo(() => (level ? level.files : groupFindings(list, state.group)), [level, list, state.group]);
  return { list, groups, level, dir, unpathed };
}

/** True when a filter narrows the list below the whole status: the bulk actions, project-wide, would read as acting on what shows. */
const isNarrowed = (s) => Boolean(s.q.trim() || s.severity || s.dimension || s.paths.length || s.area);

/**
 * Folder moves and the detail's path links. Browsing folders, a link moves to
 * the finding's folder (one chip, the current folder); elsewhere it adds a chip.
 */
function pathHandlers(wb, unpathed, folders) {
  const onDir = (d) => wb.setPaths(d ? [collapseSingle(unpathed, d)] : []);
  const toFolder = (p) => onDir(p.endsWith(FOLDER_END) ? p : (parentFolder(p) || ''));
  return { onDir, onAddPath: folders ? toFolder : wb.addPath };
}

const canOpenFile = (f, actions) => Boolean(f && actions.onOpenFile && (!actions.canOpenFile || actions.canOpenFile(f)));

/** The list's filters (not the search text, so typing keeps the scroll) as a string: a new value starts the row cap over. */
const listKeyOf = (s) => [s.severity, s.dimension, s.status, s.group, s.area?.name, ...s.paths].join(KEY_SEP);

export default function FindingsWorkbench({ dims, dismissed, dismissedLoading = false, workbench, onWorkbenchChange, actions = {} }) {
  const searchRef = useRef(null);
  const split = useSplitWidth();
  const all = useMemo(() => flattenFindings(dims, dismissed), [dims, dismissed]);
  const wb = useWorkbenchState(workbench, onWorkbenchChange);
  const { state, set } = wb;
  const { list, groups, level, dir, unpathed } = useView(all, state);
  const ids = useMemo(() => groups.flatMap((g) => g.items.map((f) => f.id)), [groups]);
  const byId = useMemo(() => new Map(all.map((f) => [f.id, f])), [all]);
  const selectedId = useSelection(ids, state.selectedId);
  const selected = byId.get(selectedId) || null;
  const select = useCallback((id) => set({ selectedId: id }), [set]);
  useWorkbenchKeys({ ids, selectedId, onSelect: select, searchRef });
  const folders = state.group === FINDING_GROUP.FOLDERS;
  const { onDir, onAddPath } = pathHandlers(wb, unpathed, folders);
  const lineOnly = state.group === FINDING_GROUP.FILE || folders;
  // The dismissed list's first fetch: bars, not a "nothing matches" that reads as "nothing dismissed".
  const waiting = dismissedLoading && state.status === FINDING_STATUS.DISMISSED && !all.some((f) => f.status === FINDING_STATUS.DISMISSED);
  const canOpen = canOpenFile(selected, actions);
  // A pending selection reaches the nav entry before the file page is pushed over it.
  const openFile = (f) => { wb.flush(); actions.onOpenFile(f); };
  return (
    <div className="wb">
      <WorkbenchBar findings={all} state={state} set={set} addPath={wb.addPath} removePath={wb.removePath} setPaths={wb.setPaths}
        dimensions={openByDimension(all)} statusCounts={statusCountsOf(all, state)} inputRef={searchRef} />
      {state.status === FINDING_STATUS.DISMISSED && !isNarrowed(state) && (
        <DismissedBulk count={all.filter((f) => f.status === FINDING_STATUS.DISMISSED).length}
          onRestoreAll={actions.onRestoreAll} onDeleteAll={actions.onDeleteAll} />
      )}
      {waiting ? <CardListSkeleton rows={3} /> : (
      <div ref={split.rootRef} className="wb-split wb-split--resizable" style={splitColumns(split)}>
        <FindingList key={listKeyOf(state)} groups={groups} browse={level ? { dir, folders: level.folders, onDir } : null}
          selectedId={selectedId} onSelect={select} shown={list.length} total={statusPool(all, state.status).length} lineOnly={lineOnly} />
        <SplitDivider split={split} />
        <FindingDetail finding={selected} dims={dims} findings={all} onAddPath={onAddPath}
          actions={{ ...actions, onOpenFile: canOpen ? openFile : undefined }} />
      </div>
      )}
    </div>
  );
}
