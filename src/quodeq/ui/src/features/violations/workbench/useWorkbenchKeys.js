/**
 * ↑ ↓ move the selection through the visible findings and `/` focuses the
 * search, unless the user is typing in a field or a dialog is open.
 */
import { useEffect } from 'react';
import { KEY } from '../../../vocab/keyboard.js';

const UP = KEY.ARROW_UP;
const DOWN = KEY.ARROW_DOWN;
const SLASH = '/';
// Fields and open menus keep their own keys, and nothing moves while a dialog is open.
const TYPING = ['input', 'textarea', 'select', '[contenteditable]', '[role=menu]'].join(',');
const DIALOG = ['[role=dialog]', '[role=alertdialog]'].join(',');

const leaveAlone = (e) => e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey
  || Boolean(e.target?.closest?.(TYPING)) || Boolean(document.querySelector(DIALOG));

/** Binds the workbench keys on window while mounted. */
export function useWorkbenchKeys({ ids, selectedId, onSelect, searchRef }) {
  useEffect(() => {
    const onKey = (e) => {
      if (leaveAlone(e)) return;
      if (e.key === SLASH) { e.preventDefault(); searchRef.current?.querySelector('input')?.focus(); return; }
      if (e.key !== UP && e.key !== DOWN) return;
      e.preventDefault();
      const i = ids.indexOf(selectedId);
      const next = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === DOWN ? 1 : -1)))];
      if (next) onSelect(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids, selectedId, onSelect, searchRef]);
}
