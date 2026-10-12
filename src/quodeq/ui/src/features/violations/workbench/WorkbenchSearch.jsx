import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { TermInput } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import { KEY } from '../../../vocab/keyboard.js';
import { pathSuggestions } from './folderModel.js';

const NONE = -1;
const STEP = Object.freeze({ [KEY.ARROW_DOWN]: 1, [KEY.ARROW_UP]: -1 });

/** Closes the open suggestions on a mouse press outside `rootRef`. */
function useOutsideClose(open, rootRef, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, rootRef, close]);
}

/** The suggestions with their open state and active option, and the input's keys over them. */
function useSuggestions({ findings, q, onQuery, onPickPath, rootRef }) {
  const [hidden, setHidden] = useState(false);
  const [active, setActive] = useState(NONE);
  const suggestions = useMemo(() => pathSuggestions(findings, q), [findings, q]);
  useEffect(() => { setHidden(false); setActive(NONE); }, [q]);
  const open = !hidden && suggestions.length > 0;
  const closeRef = useRef(() => { setHidden(true); setActive(NONE); });
  useOutsideClose(open, rootRef, closeRef.current);
  const pick = (path) => { onPickPath(path); onQuery(''); };
  const onKeyDown = (e) => {
    if (e.key === KEY.ESCAPE) { closeRef.current(); return; }
    if (!open) return;
    if (STEP[e.key]) {
      e.preventDefault();
      setActive((a) => Math.max(NONE, Math.min(suggestions.length - 1, a + STEP[e.key])));
    } else if (e.key === KEY.ENTER && active !== NONE) {
      e.preventDefault();
      pick(suggestions[active][0]);
    }
  };
  return { suggestions, open, active, close: closeRef.current, pick, onKeyDown };
}

/**
 * The app's `$ grep -r` input. A path-like query offers matching folders and
 * files with their finding counts; picking one (click, or ↓ ↑ and Enter)
 * becomes a path chip.
 */
export default function WorkbenchSearch({ findings, q, onQuery, onPickPath, inputRef }) {
  const rootRef = useRef(null);
  const baseId = useId();
  const s = useSuggestions({ findings, q, onQuery, onPickPath, rootRef });
  const optionId = (i) => `${baseId}-opt-${i}`;
  const setRoot = (node) => { rootRef.current = node; if (inputRef) inputRef.current = node; };
  return (
    <div className="wb-search" ref={setRoot}>
      <TermInput command={t('violations.wbSearchCommand')} placeholder={t('violations.wbSearchPlaceholder')}
        value={q} onChange={onQuery} onKeyDown={s.onKeyDown} onBlur={s.close}
        activeDescendant={s.open && s.active !== NONE ? optionId(s.active) : undefined} ariaLabel={t('violations.wbSearchAria')} />
      {s.open && (
        <div className="wb-sugg" role="listbox" aria-label={t('violations.wbSuggestHint')}>
          <span className="compare-dueltrigger__hint">{t('violations.wbSuggestHint')}</span>
          {s.suggestions.map(([path, count], i) => (
            <button key={path} id={optionId(i)} type="button" role="option" aria-selected={i === s.active}
              className={`compare-dueltrigger__item${i === s.active ? ' wb-menu__current' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => s.pick(path)}>
              <span className="wb-sugg__path">{path}</span>
              <span className="wb-menu__count">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
