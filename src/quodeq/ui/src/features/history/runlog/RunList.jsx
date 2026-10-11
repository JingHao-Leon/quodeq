import { useEffect, useRef } from 'react';
import { t } from '../../../strings/index.js';
import RunLogPanel from './RunLogPanel.jsx';
import { dayLabel, timeLabel, scoreText, PLUS, MINUS } from './runFormat.js';
import { originLabel, scopeLabel } from './runLogModel.js';

const OTHER_MODEL = 'other-model';
const PENDING_DOTS = '··';
const SCROLL_PAD = 28;
const SCROLL_TOP_ROOM = 36;
const SCROLL_BOTTOM_ROOM = 8;

/** `+new -resolved` of a run against its comparison run. */
export function Moves({ run }) {
  if (run.pending) {
    return <span className="rl-moves rl-moves--loading" aria-label={t('history.loading')}><span>{PLUS}{PENDING_DOTS}</span><span>{MINUS}{PENDING_DOTS}</span></span>;
  }
  if (!run.counts) return <span className="rl-moves rl-moves--none" title={t('history.noComparisonTitle')}>—</span>;
  const other = run.baselineKind === OTHER_MODEL;
  return (
    <span className="rl-moves" title={other ? t('history.otherModelTitle') : undefined}>
      <span className={run.counts.new ? 'rl-new' : 'rl-zero'}>{PLUS}{run.counts.new}</span>
      <span className={run.counts.resolved ? 'rl-fixed' : 'rl-zero'}>{MINUS}{run.counts.resolved}</span>
    </span>
  );
}

/** Column headings over the row's moves pair and score, in the moves' own colours. */
function ColumnHeads() {
  return (
    <span className="rl-cols">
      <span className="rl-cols__moves"><span className="rl-new">{t('history.colNew')}</span> · <span className="rl-fixed">{t('history.colResolved')}</span></span>
      <span className="rl-cols__score">{t('history.colScore')}</span>
    </span>
  );
}

// Scroll the list only, never the page.
function useKeepSelectedInView(selectedId) {
  const ref = useRef(null);
  useEffect(() => {
    const list = ref.current;
    const row = list?.querySelector('.rl-row.is-sel');
    if (!row) return;
    const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop + SCROLL_PAD) list.scrollTop = top - SCROLL_TOP_ROOM;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + SCROLL_BOTTOM_ROOM;
  }, [selectedId]);
  return ref;
}

function RunRow({ run, selected, hovered, onSelect, onHover }) {
  const origin = originLabel(run.origin);
  const cls = `rl-row${selected ? ' is-sel' : ''}${hovered ? ' is-hover' : ''}`;
  return (
    <button type="button" className={cls} aria-current={selected || undefined} onClick={() => onSelect(run.runId)}
      onMouseEnter={() => onHover(run.runId)} onMouseLeave={() => onHover(null)}>
      <span className="rl-row__time">{timeLabel(run.startedAt)}</span>
      <span className="rl-row__what">
        {origin && <span className="rl-row__origin">{origin}</span>}
        {run.partial && <span className="rl-row__scope rl-row__scope--partial">{scopeLabel(run, t)}</span>}
      </span>
      <Moves run={run} />
      <span className="rl-row__score">{scoreText(run.score)}</span>
    </button>
  );
}

/** No runs to list: none finished yet, or none left by the filters (which it offers to clear). */
function NoRuns({ onClearFilters }) {
  if (!onClearFilters) return <div className="rl-empty">{t('history.noRuns')}</div>;
  return (
    <div className="rl-empty">
      {t('history.noRunsFiltered')}{' '}
      <button type="button" className="eval-pill-btn" onClick={onClearFilters}>{t('history.clearFilters')}</button>
    </div>
  );
}

/**
 * The runs, newest first, grouped under day labels. `onClearFilters` is
 * set when filters are on.
 */
export default function RunList({ rows, selectedId, onSelect, hoverId, onHover, onClearFilters }) {
  const ref = useKeepSelectedInView(selectedId);
  const oldest = rows.at(-1);
  let lastDay = '';
  return (
    <RunLogPanel label={t('history.runsLabel', { count: rows.length })} className="rl-listpanel" stats={<ColumnHeads />}
      foot={oldest ? <span>{t('history.runsSince', { date: dayLabel(oldest.startedAt) })}</span> : null}>
      <div className="rl-list" ref={ref} aria-label={t('history.runsAria')}>
        {!rows.length && <NoRuns onClearFilters={onClearFilters} />}
        {rows.map((run) => {
          const d = dayLabel(run.startedAt);
          const head = d !== lastDay ? <div className="rl-day">{d}</div> : null;
          lastDay = d;
          return (
            <div key={run.runId}>
              {head}
              <RunRow run={run} selected={run.runId === selectedId}
                hovered={run.runId === hoverId} onSelect={onSelect} onHover={onHover} />
            </div>
          );
        })}
      </div>
    </RunLogPanel>
  );
}
