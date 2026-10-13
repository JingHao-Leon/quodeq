import { useMemo, useState } from 'react';
import { t, LOCALE } from '../../../../strings/index.js';
import { KEY } from '../../../../vocab/keyboard.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { PERCENT } from '../../../../constants.js';
import { PLAYBACK_SPEEDS } from '../../model/timelapsePlayback.js';
import {
  BAR_VIEW, runX, trendPoints, trendPath, changeBars, monthTicks, runIndexAt, issueDelta, signedCount, dayDate,
} from '../core/timelapseBarModel.js';

const GLYPH = Object.freeze({ FIRST: '⏮', PLAY: '▶', PAUSE: '❚❚', LATEST: '⏭' });
const STEP_OF = { [KEY.ARROW_LEFT]: -1, [KEY.ARROW_DOWN]: -1, [KEY.ARROW_RIGHT]: 1, [KEY.ARROW_UP]: 1 };
const LEGEND = Object.freeze([
  { key: 'map.timelapseLegendIssues', swatch: 'map-timelapse__swatch--trend' },
  { key: 'map.timelapseLegendNew', swatch: 'map-timelapse__swatch--new' },
  { key: 'map.timelapseLegendFixed', swatch: 'map-timelapse__swatch--fixed' },
]);
const pct = (x) => `${(x / BAR_VIEW.width) * PERCENT}%`;
const dateOf = (run) => formatShortDate(dayDate(run.day).toISOString());
const count = (n) => n.toLocaleString(LOCALE);

function readout(runs, k) {
  return t('map.timelapseReadout', {
    date: dateOf(runs[k]), n: k + 1, total: runs.length, issues: count(runs[k].issues), delta: signedCount(issueDelta(runs, k)),
  });
}

function runTitle(run) {
  return t('map.timelapseRunTitle', { date: dateOf(run), issues: count(run.issues), added: count(run.added), fixed: count(run.fixed) });
}

function Buttons({ playing, controls }) {
  return (
    <div className="map-timelapse__buttons">
      <button type="button" className="term-btn" onClick={controls.first} aria-label={t('map.timelapseFirst')}>{GLYPH.FIRST}</button>
      <button type="button" className="term-btn" onClick={controls.toggle} aria-label={t(playing ? 'map.timelapsePause' : 'map.timelapsePlay')}>
        {playing ? GLYPH.PAUSE : GLYPH.PLAY}
      </button>
      <button type="button" className="term-btn" onClick={controls.latest} aria-label={t('map.timelapseLatest')}>{GLYPH.LATEST}</button>
    </div>
  );
}

function Speeds({ speed, setSpeed }) {
  return (
    <div className="term-seg" role="group" aria-label={t('map.timelapseSpeedAria')}>
      {PLAYBACK_SPEEDS.map((s) => (
        <button key={s} type="button" className={`term-btn${s === speed ? ' term-btn--on' : ''}`} aria-pressed={s === speed}
          onClick={() => setSpeed(s)}>
          {t('map.timelapseSpeed', { n: s })}
        </button>
      ))}
    </div>
  );
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

function Track({ runs, position, controls }) {
  const [hover, setHover] = useState(null);
  const geometry = useMemo(() => ({ points: trendPoints(runs), bars: changeBars(runs), ticks: monthTicks(runs) }), [runs]);
  const at = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    return runIndexAt((e.clientX - box.left) / Math.max(1, box.width), runs.length);
  };
  const dot = geometry.points[position];
  return (
    <div
      className="map-timelapse__track" role="slider" tabIndex={0} aria-label={t('map.timelapseTrackAria')}
      aria-valuemin={1} aria-valuemax={runs.length} aria-valuenow={position + 1} aria-valuetext={readout(runs, position)}
      onKeyDown={keyHandler(controls)} onMouseMove={(e) => setHover(at(e))} onMouseLeave={() => setHover(null)}
      onClick={(e) => controls.seek(at(e))}
    >
      <TrackPlot runs={runs} position={position} geometry={geometry} />
      <span className="map-timelapse__dot" style={{ left: pct(dot.x), top: dot.y }} />
      {geometry.ticks.map((tick) => (
        <span key={tick.index} className="map-timelapse__tick" style={{ left: pct(runX(tick.index, runs.length)) }}>{tick.label}</span>
      ))}
      {hover !== null && (
        <span className="map-tooltip map-timelapse__tip" style={{ left: pct(runX(hover, runs.length)) }}>{runTitle(runs[hover])}</span>
      )}
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
 * The time-lapse bar under the map (spec 2.5): first, play/pause, latest;
 * speed; a track with the issue trend, new (up) and fixed (down) bars per
 * run, month ticks and the current run; and a readout of the run shown.
 * The track is a slider: arrows step, Home/End jump, Space plays or pauses.
 * Nothing is drawn until the history has a run; a position past the last
 * run shows the last run.
 */
export default function TimelapseBar({ timelapse }) {
  const { data, position, playing, speed, controls } = timelapse;
  const { runs } = data;
  if (!runs.length) return null;
  const shown = Math.min(position, runs.length - 1);
  return (
    <div className="map-timelapse" role="group" aria-label={t('map.timelapseAria')}>
      <Buttons playing={playing} controls={controls} />
      <Speeds speed={speed} setSpeed={controls.setSpeed} />
      <Track runs={runs} position={shown} controls={controls} />
      <div className="map-timelapse__info">
        <div className="map-timelapse__readout">{readout(runs, shown)}</div>
        <Legend />
      </div>
    </div>
  );
}
