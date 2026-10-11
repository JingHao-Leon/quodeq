import { useEffect } from 'react';

const KEY_DOWN = 'ArrowDown';
const KEY_UP = 'ArrowUp';
const KEY_ENTER = 'Enter';
// Fields keep their own keys, and so does anything inside a dialog.
const KEEP_KEYS_TARGETS = ['input', 'textarea', 'select', '[contenteditable]', '[role=dialog]'].join(',');

const keepsOwnKeys = (e) => e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || Boolean(e.target?.closest?.(KEEP_KEYS_TARGETS));

/**
 * Up and down select the next or previous run; Enter opens the selected one
 * when nothing else has focus. Keys typed into a field, a select or a
 * dialog, and keys pressed with a modifier, are left alone.
 */
export function useKeyboardSelect(rows, selectedId, onSelect, onEnter) {
  useEffect(() => {
    function onKey(e) {
      if (keepsOwnKeys(e)) return;
      const i = rows.findIndex((r) => r.runId === selectedId);
      if (e.key === KEY_DOWN || e.key === KEY_UP) {
        e.preventDefault();
        const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === KEY_DOWN ? 1 : -1)))];
        if (next && next.runId !== selectedId) onSelect(next.runId);
      } else if (e.key === KEY_ENTER && rows[i] && e.target === document.body) {
        onEnter(rows[i]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selectedId, onSelect, onEnter]);
}
