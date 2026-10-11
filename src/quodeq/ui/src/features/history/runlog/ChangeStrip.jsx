import { t } from '../../../strings/index.js';
import ChartKeyboardControls from '../../../components/ChartKeyboardControls.jsx';
import RunLogPanel from './RunLogPanel.jsx';
import { dayLabel, timeLabel } from './runFormat.js';
import { stripStart, scaleMax, STRIP_RUNS, STRIP_PAGE } from './runLogModel.js';

const W = 1000;
const H = 70;
const MID = H / 2;
const BAR_MAX = 26;
const BAR_SHARE = 0.6;
const LABEL_ROOM = 13;
const MIN_BAR = 1.5;
const LABEL_ABOVE = 14;
const LABEL_BELOW = 2;
const BREAK_STEP = 4; // slant and spacing of the two break strokes
const BREAK_BAR_OFFSET = 6; // where the break sits on a new bar, from the tip
const BREAK_RES_OFFSET = 14; // and on a resolved bar
const NONE_X = 0.35; // the "no comparison" dash: start and width as a share of the bar
const NONE_W = 0.3;
const HALF = 0.5;
const SEL_INSET = 2;
const PERCENT = 100;
const KEY_NEW = 'new';
const KEY_RESOLVED = 'resolved';
const SIDE_OLDER = 'older';

const SAME_MODEL = 'same-model';
const OTHER_MODEL = 'other-model';

// Only a same-model comparison is plotted: another model words its findings
// differently, so its churn is huge and says little about the code.
const plotted = (r) => Boolean(r.counts) && !r.pending && r.baselineKind === SAME_MODEL;
const countOf = (r, k) => (plotted(r) ? r.counts[k] || 0 : 0);

function barTitle(run, n, r) {
  const when = `${dayLabel(run.startedAt)} ${timeLabel(run.startedAt)}`;
  if (plotted(run)) return `${when} · ${t('history.stripTitleCounts', { new: n, resolved: r })}`;
  return `${when} · ${t(run.baselineKind === OTHER_MODEL ? 'history.otherModelTitle' : 'history.noComparisonTitle')}`;
}

function BreakMark({ x, w, y }) {
  return <path d={`M${x - 1} ${y + BREAK_STEP} L${x + w + 1} ${y} M${x - 1} ${y + 2 * BREAK_STEP} L${x + w + 1} ${y + BREAK_STEP}`} className="rl-strip__break" />;
}

function RunBars({ run, i, step, bar, h, cap, selected, hovered, onSelect, onHover }) {
  const w = bar;
  const x = i * step + (step - w) / 2;
  const n = countOf(run, KEY_NEW);
  const r = countOf(run, KEY_RESOLVED);
  const has = plotted(run);
  const title = barTitle(run, n, r);
  return (
    <g onClick={() => onSelect(run.runId)} onMouseEnter={() => onHover(run.runId)} onMouseLeave={() => onHover(null)}
      className={`rl-strip__run${selected ? ' is-sel' : ''}${hovered ? ' is-hover' : ''}`}>
      <title>{title}</title>
      <rect x={i * step} y="0" width={step} height={H} fill="transparent" />
      {has ? (
        <>
          {n > 0 && <rect x={x} y={MID - h(n)} width={w} height={Math.max(h(n), MIN_BAR)} rx="2" className="rl-new-fill" />}
          {n > cap && <BreakMark x={x} w={w} y={MID - h(n) + BREAK_BAR_OFFSET} />}
          {r > 0 && <rect x={x} y={MID} width={w} height={Math.max(h(r), MIN_BAR)} rx="2" className="rl-fixed-fill" />}
          {r > cap && <BreakMark x={x} w={w} y={MID + h(r) - BREAK_RES_OFFSET} />}
        </>
      ) : <rect x={x + w * NONE_X} y={MID - 1} width={w * NONE_W} height="2" rx="1" className="rl-none-fill" />}
      {(selected || hovered) && <rect x={i * step + SEL_INSET} y="1" width={step - 2 * SEL_INSET} height={H - 2} rx="3" className={selected ? 'rl-strip__sel' : 'rl-strip__hov'} />}
    </g>
  );
}

function CountLabels({ pts, h }) {
  return pts.map((run, i) => {
    if (!plotted(run)) return null;
    const left = `${((i + HALF) / pts.length) * PERCENT}%`;
    const n = countOf(run, KEY_NEW);
    const r = countOf(run, KEY_RESOLVED);
    return (
      <span key={run.runId}>
        {n > 0 && <span className="rl-strip__lbl rl-new" style={{ left, top: MID - h(n) - LABEL_ABOVE }}>{n}</span>}
        {r > 0 && <span className="rl-strip__lbl rl-fixed" style={{ left, top: MID + h(r) + LABEL_BELOW }}>{r}</span>}
      </span>
    );
  });
}

function PageButton({ side, disabled, onClick }) {
  const older = side === SIDE_OLDER;
  return (
    <button type="button" className={`rl-strip__page rl-strip__page--${side}`} disabled={disabled} onClick={onClick}
      aria-label={t(older ? 'history.stripOlder' : 'history.stripNewer')}>{older ? '‹' : '›'}</button>
  );
}

/** New and resolved findings per run, a window of STRIP_RUNS that follows the selection. */
export default function ChangeStrip({ rows, selectedId, onSelect, hoverId, onHover, start, onPage }) {
  // A paged window kept from before a filter narrowed the rows is pulled
  // back into range.
  const first = start == null ? stripStart(rows, selectedId, STRIP_RUNS) : Math.max(0, Math.min(start, rows.length - STRIP_RUNS));
  const pts = rows.slice(first, first + STRIP_RUNS).reverse();
  const step = W / Math.max(pts.length, 1);
  const bar = Math.min(step * BAR_SHARE, BAR_MAX);
  const { max, cap } = scaleMax(pts.flatMap((r) => [countOf(r, KEY_NEW), countOf(r, KEY_RESOLVED)]));
  const h = (v) => (Math.min(v, max) / max) * (MID - LABEL_ROOM);
  const kbdItems = pts.map((r) => ({
    key: r.runId,
    // A run without a plotted comparison says why instead of "0 new".
    text: plotted(r)
      ? t('history.stripKbdItem', { date: `${dayLabel(r.startedAt)} ${timeLabel(r.startedAt)}`, new: countOf(r, KEY_NEW), resolved: countOf(r, KEY_RESOLVED) })
      : barTitle(r, 0, 0),
    onActivate: () => onSelect(r.runId),
  }));
  const label = t('history.stripLabel', { from: first + 1, to: first + pts.length, total: rows.length });
  const legend = <><i className="rl-key rl-new-bg" />{t('history.stripNew')} <i className="rl-key rl-fixed-bg" />{t('history.stripResolved')}</>;
  return (
    <RunLogPanel label={label} className="rl-strip" stats={legend}>
      <div className="rl-strip__plot chart-with-kbd">
        <PageButton side={SIDE_OLDER} disabled={first + STRIP_RUNS >= rows.length}
          onClick={() => onPage(Math.min(first + STRIP_PAGE, rows.length - STRIP_RUNS))} />
        <PageButton side="newer" disabled={first <= 0} onClick={() => onPage(Math.max(0, first - STRIP_PAGE))} />
        <div className="rl-strip__inner">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('history.stripChartLabel')}>
            <line x1="0" x2={W} y1={MID} y2={MID} className="rl-strip__axis" />
            {pts.map((run, i) => (
              <RunBars key={run.runId} run={run} i={i} step={step} bar={bar} h={h} cap={cap}
                selected={run.runId === selectedId} hovered={run.runId === hoverId} onSelect={onSelect} onHover={onHover} />
            ))}
          </svg>
          <CountLabels pts={pts} h={h} />
        </div>
        <ChartKeyboardControls label={t('history.stripKbdLabel')} items={kbdItems} />
      </div>
    </RunLogPanel>
  );
}
