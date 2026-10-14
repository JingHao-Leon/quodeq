import { useCallback, useRef, useState } from 'react';
import { severityLabel } from '../../../strings/labels.js';
import { t } from '../../../strings/index.js';
import { KEY } from '../../../vocab/keyboard.js';
import { useSplitWidth } from '../hooks/useSplitWidth.js';
import SplitDivider, { splitColumns } from '../components/SplitDivider.jsx';
import { LIST_CAP } from '../workbench/FindingList.jsx';
import { FindingCard, CompliantDetail, SEP, CHECK_MARK, principleOf, whereOf } from './ScopeCards.jsx';

/** A compliant check's list row modifier. */
const COMPLIANT_ROW = 'compliant';
const STEP_OF_KEY = { [KEY.ARROW_DOWN]: 1, [KEY.ARROW_UP]: -1 };
const isViolationRow = (item) => Boolean(item.v);
const findingOfRow = (item) => item.v || item.c;
const rowKey = (item, i) => { const f = findingOfRow(item); return `${f.file}:${f.line}:${f.principle}:${i}`; };

/** One line of the list: the finding's title, where it is, its severity (or compliant) and principle; the selected one takes the tab stop. */
function ListRow({ item, index, within, selected, onSelect }) {
  const f = findingOfRow(item);
  const violation = isViolationRow(item);
  const meta = [violation ? severityLabel(f.severity) : t('violations.scopeCompliantShort'), principleOf(f, within)];
  return (
    <button type="button" role="option" aria-selected={selected} tabIndex={selected ? 0 : -1} data-index={index}
      className={`wb-row wb-row--${violation ? f.severity : COMPLIANT_ROW}${selected ? ' is-sel' : ''}`} onClick={() => onSelect(index)}>
      <span className="wb-row__t">{violation ? '' : `${CHECK_MARK} `}{f.title || f.principle}</span>
      <span className="wb-row__f wb-row__f--line">{whereOf(f, within)}</span>
      <span className="wb-row__meta">{meta.filter(Boolean).join(SEP)}</span>
    </button>
  );
}

/**
 * The selected row of `count`, moved by a click or by the arrow keys (focus
 * follows), and how many rows show: LIST_CAP at a time, as the workbench
 * list, raised to cover the selected one.
 */
function useListSelection(count) {
  const [selected, setSelected] = useState(0);
  const [cap, setCap] = useState(LIST_CAP);
  const listRef = useRef(null);
  const at = Math.max(0, Math.min(selected, count - 1));
  const shown = Math.max(cap, (Math.floor(at / LIST_CAP) + 1) * LIST_CAP);
  const onKeyDown = useCallback((e) => {
    const step = STEP_OF_KEY[e.key];
    if (!step || !count) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(at + step, count - 1));
    setSelected(next);
    // The row exists once React commits; focus it on the next frame.
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-index="${next}"]`)?.focus());
  }, [at, count]);
  return { at, shown, listRef, onKeyDown, select: setSelected, showMore: () => setCap(shown + LIST_CAP) };
}

/**
 * The scope as a list beside one finding in full: the same rows the cards
 * read (already filtered and sorted by the scope's controls), one line each,
 * and the selected one on the right with its code open; the divider between
 * them drags (useSplitWidth).
 */
export function ScopeList({ rows, within, onDismiss, readOnly }) {
  const findings = rows.filter((item) => item.v || item.c);
  const sel = useListSelection(findings.length);
  const current = findings[sel.at];
  const split = useSplitWidth();
  return (
    <div ref={split.rootRef} className="wb wb-split findings-scope__split" style={splitColumns(split)}>
      <section className="qd-cards-panel wb-panel">
        <div ref={sel.listRef} className="wb-list" role="listbox" tabIndex={-1} aria-label={t('violations.scopeListAria')} onKeyDown={sel.onKeyDown}>
          {findings.slice(0, sel.shown).map((item, i) => (
            <ListRow key={rowKey(item, i)} item={item} index={i} within={within} selected={i === sel.at} onSelect={sel.select} />
          ))}
          {findings.length > sel.shown && (
            <button type="button" className="wb-more" onClick={sel.showMore}>
              {t('violations.wbShowMore', { count: Math.min(LIST_CAP, findings.length - sel.shown) })}
            </button>
          )}
        </div>
      </section>
      <SplitDivider split={split} />
      <section className="qd-cards-panel wb-panel wb-detail">
        <div className="wb-detail__body">
          {current && (isViolationRow(current)
            ? <FindingCard v={current.v} within={within} onDismiss={onDismiss} readOnly={readOnly} />
            : <CompliantDetail c={current.c} within={within} />)}
        </div>
      </section>
    </div>
  );
}
