import { useCallback, useState } from 'react';
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

/** Selected run (falls back to the first visible row) and the detail tab. */
export function useHistorySelection({ initialRunId, onRunChange, rows }) {
  const [runId, setRunId] = useState(initialRunId);
  const [tab, setTabState] = useState(readTab);
  const selected = rows.find((r) => r.runId === runId) || rows[0];
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
