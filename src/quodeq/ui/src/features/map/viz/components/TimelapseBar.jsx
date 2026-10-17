import { useEffect, useMemo, useRef, useState } from 'react';
import { Transport, PlaySettings } from './TimelapseControls.jsx';
import { t, LOCALE } from '../../../../strings/index.js';
import { KEY } from '../../../../vocab/keyboard.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { PERCENT } from '../../../../constants.js';
import { GRANULARITY } from '../../../../utils/granularity.js';
import {
  BAR_VIEW, runX, trendPoints, trendPath, changeBars, monthTicks, runIndexAt, issueDelta, signedCount, dayDate,
} from '../core/timelapseBarModel.js';

const STEP_OF = { [KEY.ARROW_LEFT]: -1, [KEY.ARROW_DOWN]: -1, [KEY.ARROW_RIGHT]: 1, [KEY.ARROW_UP]: 1 };
const LEGEND = Object.freeze([
  { key: 'map.timelapseLegendIssues', swatch: 'map-timelapse__swatch--trend' },
  { key: 'map.timelapseLegendNew', swatch: 'map-timelapse__swatch--new' },
  { key: 'map.timelapseLegendFixed', swatch: 'map-timelapse__swatch--fixed' },
]);
/** The least distance between two month labels' centres, in pixels: a short month name and a gap. */
export const MIN_TICK_GAP_PX = 36;
/** The track width assumed until it is measured (and where it cannot be). */
export const TRACK_FALLBACK_PX = 420;
const pct = (x) => `${(x / BAR_VIEW.width) * PERCENT}%`;
const shortDate = (day) => formatShortDate(dayDate(day).toISOString());
const MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' });
const count = (n) => n.toLocaleString(LOCALE);

/** How a run is named in the readout and the track's tip: its day, the week it ends, or its month. */
function whenOf(run, period) {
  if (period === GRANULARITY.WEEK) return t('map.timelapseWeekOf', { date: shortDate(run.firstDay) });
  if (period === GRANULARITY.MONTH) return MONTH_YEAR.format(dayDate(run.day));
  return shortDate(run.day);
}

const countsOf = (runs, k) => ({ n: k + 1, total: runs.length, issues: count(runs[k].issues), delta: signedCount(issueDelta(runs, k)) });

function readout(runs, k, period) {
  return t('map.timelapseReadout', { when: whenOf(runs[k], period), ...countsOf(runs, k) });
}

/** The frame shown, in two lines: when (large), then its place and issues. */
function Readout({ runs, k, period }) {
  return (
    <div className="map-timelapse__readout" aria-hidden="true">
      <span className="map-timelapse__when">{whenOf(runs[k], period)}</span>
      <span className="map-timelapse__count">{t('map.timelapseReadoutCount', countsOf(runs, k))}</span>
    </div>
  );
}

function runTitle(run, period) {
  return t('map.timelapseRunTitle', { when: whenOf(run, period), issues: count(run.issues), added: count(run.added), fixed: count(run.fixed) });
}

function keyHandler(controls) {
  return (e) => {
    if (e.key in STEP_OF) controls.step(STEP_OF[e.key]);
    else if (e.key === KEY.HOME) controls.first();
    else if (e.key === KEY.END) controls.latest();
    else if (e.key === KEY.SPACE || e.key === KEY.ENTER) controls.toggle();
    else return;
    e.preventDefault();
  };
}

function TrackPlot({ runs, position, geometry }) {
  const { points, bars } = geometry;
  const mx = runX(position, runs.length);
  return (
    <svg viewBox={`0 0 ${BAR_VIEW.width} ${BAR_VIEW.height}`} preserveAspectRatio="none" aria-hidden="true" className="map-timelapse__svg">
      <rect x="0" y="0" width={mx} height={BAR_VIEW.height} className="map-timelapse__played" />
      <line x1="0" x2={BAR_VIEW.width} y1={BAR_VIEW.axis} y2={BAR_VIEW.axis} className="map-timelapse__axis" />
      {bars.map((b, i) => (
        <g key={runs[i].day} className={i > position ? 'is-future' : undefined}>
          {b.up > 0 && <rect x={b.x} y={BAR_VIEW.axis - b.up} width={b.w} height={b.up} className="rl-new-fill" />}
          {b.down > 0 && <rect x={b.x} y={BAR_VIEW.axis} width={b.w} height={b.down} className="rl-fixed-fill" />}
        </g>
      ))}
      <path d={trendPath(points)} className="map-timelapse__trend" />
      <line x1={mx} x2={mx} y1="0" y2={BAR_VIEW.height} className="map-timelapse__marker" />
    </svg>
  );
}

/** The element's width in pixels, followed as it resizes. */
function useWidth(ref) {
  const [width, setWidth] = useState(TRACK_FALLBACK_PX);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * The run's numbers above the track. It moves left by its own share of the
 * track as the run does by the track's, so it stays inside the track at both
 * ends (never over the settings button or out of the window).
 */
function RunTip({ runs, index, period }) {
  const left = pct(runX(index, runs.length));
  return <span className="map-tooltip map-timelapse__tip" style={{ left, transform: `translateX(-${left})` }}>{runTitle(runs[index], period)}</span>;
}

function Track({ runs, position, controls, period }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const width = useWidth(ref);
  const geometry = useMemo(() => ({ points: trendPoints(runs), bars: changeBars(runs) }), [runs]);
  const ticks = useMemo(() => monthTicks(runs, (MIN_TICK_GAP_PX / width) * BAR_VIEW.width), [runs, width]);
  const at = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    return runIndexAt((e.clientX - box.left) / Math.max(1, box.width), runs.length);
  };
  const dot = geometry.points[position];
  return (
    <div
      ref={ref} className="map-timelapse__track" role="slider" tabIndex={0} aria-label={t('map.timelapseTrackAria')}
      aria-valuemin={1} aria-valuemax={runs.length} aria-valuenow={position + 1} aria-valuetext={readout(runs, position, period)}
      onKeyDown={keyHandler(controls)} onMouseMove={(e) => setHover(at(e))} onMouseLeave={() => setHover(null)}
      onClick={(e) => controls.seek(at(e))}
    >
      <TrackPlot runs={runs} position={position} geometry={geometry} />
      <span className="map-timelapse__dot" style={{ left: pct(dot.x), top: dot.y }} />
      {ticks.map((tick) => (
        <span key={tick.index} className="map-timelapse__tick" style={{ left: pct(runX(tick.index, runs.length)) }}>{tick.label}</span>
      ))}
      {hover !== null && <RunTip runs={runs} index={hover} period={period} />}
    </div>
  );
}

/** What the trend line and the two bar colours stand for. */
function Legend() {
  return (
    <ul className="map-timelapse__legend">
      {LEGEND.map(({ key, swatch }) => (
        <li key={key}><span className={`map-timelapse__swatch ${swatch}`} aria-hidden="true" />{t(key)}</li>
      ))}
    </ul>
  );
}

/**
 * The time-lapse bar, docked at the bottom of the map (spec 2.5): first,
 * one back, play/pause, one forward, latest; the frame shown in two lines; a
 * track with the issue trend, new (up) and fixed (down) bars per frame, month
 * ticks and the current frame; and a settings button (day, week or month,
 * then speed).
 * The track is a slider: arrows step, Home/End jump, Space plays or pauses.
 * Nothing is drawn until the history has a run; a position past the last
 * run shows the last run.
 */
export default function TimelapseBar({ timelapse }) {
  const { data, playing, speed, controls } = timelapse;
  // The frames played (every day, or each week's or month's last run); a bare history plays day by day.
  const frames = timelapse.frames || { runs: data.runs, position: timelapse.position, period: GRANULARITY.DAY };
  const { runs, position, period, setPeriod } = frames;
  if (!runs.length) return null;
  const shown = Math.min(position, runs.length - 1);
  return (
    <div className="map-timelapse" role="group" aria-label={t('map.timelapseAria')}>
      <Transport playing={playing} controls={controls} />
      <Readout runs={runs} k={shown} period={period} />
      <div className="map-timelapse__timeline">
        <Track runs={runs} position={shown} controls={controls} period={period} />
        <Legend />
      </div>
      <PlaySettings period={period} setPeriod={setPeriod} speed={speed} setSpeed={controls.setSpeed} />
    </div>
  );
}
