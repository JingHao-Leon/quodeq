import { useId } from 'react';
import { t } from '../../../strings/index.js';

const PERCENT = 100;

// Two decimals at most, no trailing zeros: 0.25, 2, 0.08.
const show = (v) => String(Number(v.toFixed(2)));

/**
 * One knob: its label (and the formula's own name, small), the slider with a
 * tick where the Q² default sits, and the value, the saved one struck
 * through beside it while the draft differs.
 */
export default function KnobSlider({ knob, value, savedValue, defaultValue, onChange, onHint }) {
  const id = useId();
  const span = knob.max - knob.min;
  const tickPct = ((defaultValue - knob.min) / span) * PERCENT;
  const fillPct = ((value - knob.min) / span) * PERCENT;
  const changed = value !== savedValue;
  return (
    <div className="gf-knob" onMouseEnter={() => onHint?.(knob.hintKey)} onFocus={() => onHint?.(knob.hintKey)}>
      <label className="gf-knob__label" htmlFor={id}>
        {t(knob.labelKey)}
        {knob.techKey && <span className="gf-knob__tech">{t(knob.techKey)}</span>}
      </label>
      <div className="gf-knob__track" style={{ '--fill': `${fillPct}%` }}>
        <span className="gf-knob__tick" style={{ left: `${tickPct}%` }} title={t('gradeFormula.defaultTick', { value: show(defaultValue) })} />
        <input id={id} type="range" min={knob.min} max={knob.max} step={knob.step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))} />
      </div>
      <span className={`gf-knob__value${changed ? ' gf-knob__value--changed' : ''}`}>
        {changed && <s>{show(savedValue)}</s>}
        {show(value)}
      </span>
    </div>
  );
}
