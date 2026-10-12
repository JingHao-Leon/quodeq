import { useEffect, useRef, useState } from 'react';
import { SectionLabel } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import { FINDING_STATUS } from '../violationsVocab.js';
import { Crumbs, FolderRows } from './FolderRows.jsx';

export const LIST_CAP = 300;

function Row({ f, selected, onSelect, lineOnly }) {
  const dismissed = f.status === FINDING_STATUS.DISMISSED;
  const where = `${lineOnly ? '' : f.file}${f.line != null ? `:${f.line}` : ''}`;
  return (
    <button type="button" aria-current={selected || undefined} onClick={() => onSelect(f.id)}
      className={`wb-row wb-row--${f.severity}${selected ? ' is-sel' : ''}${dismissed ? ' is-dismissed' : ''}`}>
      <span className="wb-row__t">{f.title}</span>
      <span className={`wb-row__f${lineOnly ? ' wb-row__f--line' : ''}`}>{where}</span>
      <span className="wb-row__meta">
        {dismissed && <span className="wb-tag">{t('violations.wbDismissedTag')}</span>}
        {[f.principle, f.dimension].filter(Boolean).join(' · ')}
      </span>
    </button>
  );
}

/** Cut the groups to the first `cap` rows, keeping group headers of what shows. */
function capGroups(groups, cap) {
  const out = [];
  let left = cap;
  for (const g of groups) {
    if (left <= 0) break;
    out.push({ ...g, items: g.items.slice(0, left) });
    left -= g.items.length;
  }
  return out;
}

function useSelectedInView(selectedId) {
  const ref = useRef(null);
  useEffect(() => {
    const list = ref.current;
    const row = list?.querySelector('.wb-row.is-sel');
    if (!row) return;
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight - list.clientHeight;
  }, [selectedId]);
  return ref;
}

function GroupHeader({ g }) {
  if (g.key === null) return null;
  return (
    <div className="wb-group">
      <span className="wb-group__k">{g.key === '' ? t('violations.wbNoKey') : g.key}</span>
      <span className="wb-group__n">{g.items.length}</span>
    </div>
  );
}

/** The row cap, raised in LIST_CAP steps to cover the selected row (↓ can select past it). */
function capCovering(cap, groups, selectedId) {
  const index = groups.flatMap((g) => g.items).findIndex((f) => f.id === selectedId);
  return index < cap ? cap : (Math.floor(index / LIST_CAP) + 1) * LIST_CAP;
}

export default function FindingList({ groups, browse, selectedId, onSelect, shown, total, lineOnly }) {
  const [ownCap, setCap] = useState(LIST_CAP);
  const cap = capCovering(ownCap, groups, selectedId);
  const ref = useSelectedInView(selectedId);
  const rows = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <section className="qd-cards-panel wb-panel wb-listpanel" aria-label={t('violations.wbListAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('violations.wbFindingsLabel', { count: shown })}</SectionLabel>
        <span className="run-history-panel__stats" role="status" aria-live="polite">{t('violations.wbShownOf', { shown, total })}</span>
      </div>
      {browse && <Crumbs dir={browse.dir} onDir={browse.onDir} />}
      <div className="wb-list" ref={ref}>
        {browse && <FolderRows folders={browse.folders} dir={browse.dir} onDir={browse.onDir} />}
        {shown === 0 && <div className="wb-empty">{t('violations.wbEmpty')}</div>}
        {capGroups(groups, cap).map((g) => (
          <div key={g.key ?? ''}>
            <GroupHeader g={g} />
            {g.items.map((f) => <Row key={f.id} f={f} selected={f.id === selectedId} onSelect={onSelect} lineOnly={lineOnly} />)}
          </div>
        ))}
        {rows > cap && (
          <button type="button" className="wb-more" onClick={() => setCap(cap + LIST_CAP)}>
            {t('violations.wbShowMore', { count: Math.min(LIST_CAP, rows - cap) })}
          </button>
        )}
      </div>
      <div className="panel-foot"><span>{t('violations.wbFoot')}</span></div>
    </section>
  );
}
