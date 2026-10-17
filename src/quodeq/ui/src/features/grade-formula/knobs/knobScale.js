// Where a knob's value sits on its slider. Most knobs are linear; a log knob
// (the severity weights, 0.05 to 25) spreads its range by ratio, so a minor
// weight near 0.15 gets as much travel as a critical one near 7.5.

/** How a knob's slider spreads its range; a knob without `scale` is linear. */
export const KNOB_SCALE = Object.freeze({ LOG: 'log' });

/** Positions on a log slider: one arrow-key press moves the value about 3%. */
export const LOG_POSITIONS = 200;
// Log values keep two significant figures: 0.15, 1.2, 7.5, 12.
const SIGNIFICANT = 2;
const PERCENT = 100;

const isLog = (knob) => knob.scale === KNOB_SCALE.LOG;
const ratio = (knob) => Math.log(knob.max / knob.min);
const roundSignificant = (v) => Number(v.toPrecision(SIGNIFICANT));

/** The range input's own min, max and step for a knob. */
export function inputRange(knob) {
  return isLog(knob) ? { min: 0, max: LOG_POSITIONS, step: 1 } : { min: knob.min, max: knob.max, step: knob.step };
}

/** A knob value as the range input's position. */
export function toPosition(knob, value) {
  if (!isLog(knob)) return value;
  const clamped = Math.min(knob.max, Math.max(knob.min, value));
  return (Math.log(clamped / knob.min) / ratio(knob)) * LOG_POSITIONS;
}

/** The knob value a range input position stands for. */
export function fromPosition(knob, position) {
  if (!isLog(knob)) return position;
  const value = roundSignificant(knob.min * Math.exp((position / LOG_POSITIONS) * ratio(knob)));
  return Math.min(knob.max, Math.max(knob.min, value));
}

/** How far along its track a value sits, 0 to 100. */
export function trackPercent(knob, value) {
  if (isLog(knob)) return (toPosition(knob, value) / LOG_POSITIONS) * PERCENT;
  return ((value - knob.min) / (knob.max - knob.min)) * PERCENT;
}
