import { useCallback, useEffect, useRef, useState } from 'react';
import { readString, writeString } from '../../../adapters/storage.js';

const TAB_KEY = 'quodeq.history.tab';
const DEFAULT_TAB = 'dimensions';

function session() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch (err) {
    console.warn('[history] sessionStorage blocked:', err);
    return null;
  }
}

const readTab = () => readString(TAB_KEY, DEFAULT_TAB, session());
const writeTab = (tab) => writeString(TAB_KEY, tab, session());

/**
 * Selected run and the detail tab. When the remembered run leaves `rows`
 * (deleted or filtered out) the row at the same index takes over, is
 * committed to state and reported, so clearing a filter does not jump back.
 */
export function useHistorySelection({ initialRunId, onRunChange, rows }) {
  const [runId, setRunId] = useState(initialRunId);
  const [tab, setTabState] = useState(readTab);
  const lastIndex = useRef(0);
  const found = rows.findIndex((r) => r.runId === runId);
  const selected = rows.length ? rows[found >= 0 ? found : Math.min(lastIndex.current, rows.length - 1)] : null;
  const selectedId = selected?.runId;
  useEffect(() => {
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
