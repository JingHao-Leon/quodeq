import { useCallback, useMemo, useRef, useState } from 'react';
import { t } from '../../../strings/index.js';
import { KEY } from '../../../vocab/keyboard.js';
import { useSplitWidth } from '../hooks/useSplitWidth.js';
import { useFillHeight } from '../hooks/useFillHeight.js';
import SplitDivider, { splitColumns } from '../components/SplitDivider.jsx';
import { LIST_CAP, RowMeta } from '../workbench/FindingList.jsx';
import { sevAbbr } from '../workbench/sevWords.js';
import { CompliantDetail, CHECK_MARK, principleOf, whereOf } from './ScopeCards.jsx';
import FindingView, { Where } from '../workbench/FindingView.jsx';
import FixPlanButton from '../workbench/FixPlanButton.jsx';
import DismissMenu from '../workbench/DismissMenu.jsx';
import { VerifiedChip } from '../components/VerifiedChip.jsx';
import ReqGroupHeader from './ReqGroupHeader.jsx';
import { ROW_KIND } from '../../explorer/components/findingListRows.js';

/** A compliant check's list row modifier. */
const COMPLIANT_ROW = 'compliant';
const STEP_OF_KEY = { [KEY.ARROW_DOWN]: 1, [KEY.ARROW_UP]: -1 };
const isViolationRow = (item) => Boolean(item.v);
const findingOfRow = (item) => item.v || item.c;
const rowKey = (item, i) => { const f = findingOfRow(item); return `${f.file}:${f.line}:${f.principle}:${i}`; };
const entryKey = (entry) => {
  if (entry.more != null) return `more-${entry.more}`;
  return entry.index == null ? `h-req-${entry.item.req}` : rowKey(entry.item, entry.index);
};

/** One line of the list: the finding's title, then its severity (or compliant), where it is and its principle; the selected one takes the tab stop. */
function ListRow({ item, index, within, selected, onSelect }) {
  const f = findingOfRow(item);
  const violation = isViolationRow(item);
  const level = violation ? f.severity : COMPLIANT_ROW;
  return (
    <button type="button" role="option" aria-selected={selected} tabIndex={selected ? 0 : -1} data-index={index}
      className={`wb-row wb-row--${level}${selected ? ' is-sel' : ''}`} onClick={() => onSelect(index)}>
      <span className="wb-row__t">{violation ? '' : `${CHECK_MARK} `}{f.title || f.principle}</span>
      <RowMeta level={level} word={violation ? sevAbbr(f.severity) : t('violations.scopeCompliantShort')}
        where={whereOf(f, within)} tail={principleOf(f, within)} />
    </button>
  );
}

/**
 * The selected violation in full, as in the Violations workbench: fix plan
 * and dismiss as its pills (none on a past day or a shared project). A
 * principle's items can come without their dimension; the scope's fills it,
 * so the rule's text can be looked up.
 */
function ViolationPane({ finding, within, onDismiss, readOnly }) {
  const v = finding.dimension || !within.dimension ? finding : { ...finding, dimension: within.dimension };
  return (
    <FindingView v={v} where={<Where finding={v} confidence={v.confidence} />}>
      {(!readOnly || onDismiss) && (
        <div className="wb-actions wb-bar">
          {!readOnly && <FixPlanButton v={v} principle={v.principle} />}
          {onDismiss && <DismissMenu row={null} onDismiss={() => onDismiss(v)} />}
          <VerifiedChip v={v} />
        </div>
      )}
    </FindingView>
  );
}

/**
 * The selected one of the shown `findings`, moved by a click or by the
 * arrow keys (focus follows). The selection follows its finding when rows
 * above it fold or open; a finding gone keeps its place.
 */
function useListSelection(findings) {
  const count = findings.length;
  const [picked, setPicked] = useState({ item: null, index: 0 });
  const listRef = useRef(null);
  const found = picked.item ? findings.indexOf(picked.item) : -1;
  const at = found >= 0 ? found : Math.max(0, Math.min(picked.index, count - 1));
  const setSelected = useCallback((i) => setPicked({ item: findings[i], index: i }), [findings]);
  const onKeyDown = useCallback((e) => {
    const step = STEP_OF_KEY[e.key];
    if (!step || !count) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(at + step, count - 1));
    setSelected(next);
    // The row exists once React commits; focus it on the next frame.
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-index="${next}"]`)?.focus());
  }, [at, count, setSelected]);
  return { at, listRef, onKeyDown, select: setSelected };
}

/** How many findings each group shows (the whole list is one group, ''): LIST_CAP at a time, as the workbench list. */
function useCaps() {
  const [caps, setCaps] = useState(() => new Map());
  const capOf = useCallback((group) => caps.get(group) ?? LIST_CAP, [caps]);
  const showMore = (group) => setCaps((prev) => new Map(prev).set(group, (prev.get(group) ?? LIST_CAP) + LIST_CAP));
  return { capOf, showMore };
}

/**
 * The rows that show: each requirement's header (folded ones too), its
 * findings up to its cap, each with its index among the shown findings,
 * and where a group has more, how many the next click adds.
 */
function visibleRows(rows, capOf) {
  const out = [];
  const firstHeader = rows.findIndex((item) => item.kind === ROW_KIND.REQ_HEADER);
  // The findings before any header (an ungrouped list: all of them) are a group of their own.
  let group = { key: '', total: (firstHeader < 0 ? rows : rows.slice(0, firstHeader)).filter((item) => item.v || item.c).length, seen: 0 };
  let index = 0;
  const closeGroup = () => {
    const more = group.total - capOf(group.key);
    if (more > 0) out.push({ more: group.key, count: Math.min(LIST_CAP, more) });
  };
  for (const item of rows) {
    if (item.kind === ROW_KIND.REQ_HEADER) {
      closeGroup();
      group = { key: item.req, total: item.open ? item.count : 0, seen: 0 };
      out.push({ item });
      continue;
    }
    if (!item.v && !item.c) continue;
    group.seen += 1;
    if (group.seen <= capOf(group.key)) out.push({ item, index: index++ });
  }
  closeGroup();
  return out;
}

/** One entry of the shown rows: a requirement's header, a finding's line, or a group's "show more". */
function Entry({ entry, within, sel, onToggleReq, onMore }) {
  const { item, index } = entry;
  if (entry.more != null) {
    return <button type="button" className="wb-more" onClick={() => onMore(entry.more)}>{t('violations.wbShowMore', { count: entry.count })}</button>;
  }
  if (index == null) return <ReqGroupHeader row={item} onToggle={onToggleReq} />;
  return <ListRow item={item} index={index} within={within} selected={index === sel.at} onSelect={sel.select} />;
}

/**
 * The scope as a list beside one finding in full: the same rows the cards
 * read (already filtered and sorted by the scope's controls), one line each,
 * under their requirement's header when grouped (`onToggleReq` folds one),
 * and the selected one on the right with its code open; the divider between
 * them drags (useSplitWidth).
 */
export function ScopeList({ rows, within, onDismiss, readOnly, onToggleReq }) {
  const caps = useCaps();
  const shown = useMemo(() => visibleRows(rows, caps.capOf), [rows, caps.capOf]);
  const findings = useMemo(() => shown.filter((e) => e.index != null).map((e) => e.item), [shown]);
  const sel = useListSelection(findings);
  const current = findings[sel.at];
  const split = useSplitWidth();
  useFillHeight(split.rootRef);
  return (
    <div ref={split.rootRef} className="wb wb-split findings-scope__split" style={splitColumns(split)}>
      <section className="qd-cards-panel wb-panel">
        <div ref={sel.listRef} className="wb-list" role="listbox" tabIndex={-1} aria-label={t('violations.scopeListAria')} onKeyDown={sel.onKeyDown}>
          {shown.map((entry) => (
            <Entry key={entryKey(entry)} entry={entry} within={within} sel={sel} onToggleReq={onToggleReq} onMore={caps.showMore} />
          ))}
        </div>
      </section>
      <SplitDivider split={split} />
      <section className="qd-cards-panel wb-panel wb-detail">
        {current && isViolationRow(current) && <ViolationPane finding={current.v} within={within} onDismiss={onDismiss} readOnly={readOnly} />}
        {current && !isViolationRow(current) && <div className="wb-detail__body"><CompliantDetail c={current.c} within={within} /></div>}
      </section>
    </div>
  );
}
