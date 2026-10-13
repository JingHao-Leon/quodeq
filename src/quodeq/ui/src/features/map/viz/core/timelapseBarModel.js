import { LOCALE } from '../../../../strings/index.js';

/** The bar's SVG view box and bands (stretched to the bar's width). */
export const BAR_VIEW = Object.freeze({ width: 1000, height: 60, trendTop: 4, trendBottom: 26, axis: 44, barMax: 14, barMin: 1.5, barShare: 0.6, barWidthMax: 10 });
const HALF = 0.5;
const MONTH_KEY_LENGTH = 7;          // 'YYYY-MM'
const NOON = 'T12:00:00';            // read a day at noon so no time zone moves it to the day before
const MONTH = new Intl.DateTimeFormat(LOCALE, { month: 'short' });
const MINUS = '−';
const PLUS = '+';

/** A run's day as a Date, read at local noon. */
export function dayDate(day) {
  return new Date(`${day}${NOON}`);
}

/** The x of run `index` of `count` (the middle of its slot). */
export function runX(index, count, view = BAR_VIEW) {
  return ((index + HALF) / Math.max(1, count)) * view.width;
}

/** The run under a horizontal share (0..1) of the track. */
export function runIndexAt(share, count) {
  return Math.min(count - 1, Math.max(0, Math.floor(share * count)));
}

/** Issue totals as points: most issues at the top of the trend band. */
export function trendPoints(runs, view = BAR_VIEW) {
  const values = runs.map((r) => r.issues);
  const lo = Math.min(...values);
  const span = Math.max(1, Math.max(...values) - lo);
  return runs.map((r, i) => ({
    x: runX(i, runs.length, view),
    y: view.trendBottom - ((r.issues - lo) / span) * (view.trendBottom - view.trendTop),
  }));
}

/** An SVG path through `points`. */
export function trendPath(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

/** Per run: a new bar up and a fixed bar down from the axis, square-root scaled to the busiest run. */
export function changeBars(runs, view = BAR_VIEW) {
  const peak = Math.max(1, ...runs.flatMap((r) => [r.added, r.fixed]));
  const w = Math.min((view.width / Math.max(1, runs.length)) * view.barShare, view.barWidthMax);
  const h = (v) => (v > 0 ? Math.max(view.barMin, Math.sqrt(v / peak) * view.barMax) : 0);
  return runs.map((r, i) => ({ x: runX(i, runs.length, view) - w / 2, w, up: h(r.added), down: h(r.fixed) }));
}

/** The first run of each month, labelled with the month's short name. */
export function monthTicks(runs) {
  const ticks = [];
  let month = '';
  runs.forEach((r, index) => {
    const key = r.day.slice(0, MONTH_KEY_LENGTH);
    if (key === month) return;
    month = key;
    ticks.push({ index, label: MONTH.format(dayDate(r.day)) });
  });
  return ticks;
}

/** Issues gained (+) or lost (−) against the run before; 0 for the first run. */
export function issueDelta(runs, k) {
  return k > 0 ? runs[k].issues - runs[k - 1].issues : 0;
}

/** A count with its sign: +4, −2, 0. */
export function signedCount(n) {
  if (n > 0) return `${PLUS}${n.toLocaleString(LOCALE)}`;
  return n < 0 ? `${MINUS}${(-n).toLocaleString(LOCALE)}` : '0';
}
