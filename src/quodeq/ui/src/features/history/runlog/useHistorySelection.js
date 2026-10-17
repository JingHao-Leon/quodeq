import { useCallback, useEffect, useRef, useState } from 'react';
import { readString, writeString } from '../../../adapters/storage.js';
import { historySession } from './historySession.js';

const TAB_KEY = 'quodeq.history.tab';
const DEFAULT_TAB = 'dimensions';

const readTab = () => readString(TAB_KEY, DEFAULT_TAB, historySession());
const writeTab = (tab) => writeString(TAB_KEY, tab, historySession());

/**
 * Which row shows. With no chosen run, the newest. A chosen run that left
 * `rows` gives way to the row at the same index.
 */
function pickRow(rows, runId, lastIndex) {
  if (!rows.length) return { found: -1, row: null };
  if (!runId) return { found: -1, row: rows[0] };
  const found = rows.findIndex((r) => r.runId === runId);
  return { found, row: rows[found >= 0 ? found : Math.min(lastIndex, rows.length - 1)] };
}

/**
 * Selected run and the detail tab. With no remembered run and no pick, the
 * selection follows the newest run and nothing is committed or reported.
 * A picked or remembered run that leaves `rows` (deleted or filtered out)
 * gives way to the row at the same index, which is committed and reported,
 * so clearing a filter does not jump back.
 */
export function useHistorySelection({ initialRunId, onRunChange, rows }) {
  const [runId, setRunId] = useState(initialRunId || null);
  const [tab, setTabState] = useState(readTab);
  const lastIndex = useRef(0);
  const { found, row: selected } = pickRow(rows, runId, lastIndex.current);
  const selectedId = selected?.runId;
  useEffect(() => {
    if (!runId) return;
    if (found >= 0) lastIndex.current = found;
    else if (selectedId && selectedId !== runId) {
      setRunId(selectedId);
      onRunChange?.(selectedId);
    }
  }, [found, selectedId, runId, onRunChange]);
  const select = useCallback((id) => {
    setRunId(id);
    onRunChange?.(id);
  }, [onRunChange]);
  const setTab = useCallback((next) => {
    setTabState(next);
    writeTab(next);
  }, []);
  return { selected, select, tab, setTab };
}
