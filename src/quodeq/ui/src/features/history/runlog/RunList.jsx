import { useEffect, useMemo, useRef } from 'react';
import { t } from '../../../strings/index.js';
import { scoreColorClass } from '../../../utils/formatters.js';
import RunLogPanel from './RunLogPanel.jsx';
import { dayLabel, timeLabel, scoreText, PLUS, MINUS } from './runFormat.js';
import { originLabel, scopeLabel, isSameScore } from './runLogModel.js';

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
    <span className={`rl-moves${other ? ' rl-moves--other' : ''}`} title={other ? t('history.otherModelTitle') : undefined}>
      <span className={run.counts.new ? 'rl-new' : 'rl-zero'}>{PLUS}{run.counts.new}</span>
      <span className={run.counts.resolved ? 'rl-fixed' : 'rl-zero'}>{MINUS}{run.counts.resolved}</span>
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

function RunRow({ run, same, selected, hovered, onSelect, onHover }) {
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
      <span className={`rl-row__score ${scoreColorClass(run.score)}${same ? ' rl-row__score--same' : ''}`}
        title={same ? t('history.sameScoreTitle') : undefined}>{scoreText(run.score)}</span>
    </button>
  );
}

/** The runs, newest first, grouped under day labels. `runsById` resolves baselines hidden by a filter. */
export default function RunList({ rows, runsById, selectedId, onSelect, hoverId, onHover }) {
  const ref = useKeepSelectedInView(selectedId);
  const byId = useMemo(() => runsById || new Map(rows.map((r) => [r.runId, r])), [runsById, rows]);
  const oldest = rows.at(-1);
  let lastDay = '';
  return (
    <RunLogPanel label={t('history.runsLabel', { count: rows.length })} className="rl-listpanel" stats={t('history.runsColumns')}
      foot={oldest ? <span>{t('history.runsSince', { date: dayLabel(oldest.startedAt) })}</span> : null}>
      <div className="rl-list" ref={ref} aria-label={t('history.runsAria')}>
        {rows.map((run) => {
          const d = dayLabel(run.startedAt);
          const head = d !== lastDay ? <div className="rl-day">{d}</div> : null;
          lastDay = d;
          return (
            <div key={run.runId}>
              {head}
              <RunRow run={run} same={isSameScore(run, byId)} selected={run.runId === selectedId}
                hovered={run.runId === hoverId} onSelect={onSelect} onHover={onHover} />
            </div>
          );
        })}
      </div>
    </RunLogPanel>
  );
}
