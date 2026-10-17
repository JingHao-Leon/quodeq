import { useRef } from 'react';
import { KEY } from '../../vocab/keyboard.js';
import { POINTER_EVENT } from '../../vocab/pointerEvent.js';
import { SCORE_SCALE_MAX } from '../../constants.js';
import { roundOneDecimal } from '../../utils/rounding.js';
import { t } from '../../strings/index.js';
import { GRADE_ORDER } from './impact/impactModel.js';

// The grade under the lowest threshold; the thresholds name the other four.
const BOTTOM_GRADE = GRADE_ORDER[GRADE_ORDER.length - 1];
const GRADE_COLOR_VARS = [
  'var(--color-grade-bottom-text)', 'var(--color-grade-low-text)',
  'var(--color-grade-mid-text)', 'var(--color-grade-high-text)',
  'var(--color-grade-top-text)',
];
const MIN_GAP = 0.5;

// How far a divider can move: up to half a point from each neighbour (or the scale's ends).
function dividerBounds(dividerIdx, live) {
  const lo = (dividerIdx === 0 ? 0 : live[dividerIdx - 1]) + MIN_GAP;
  const hi = (dividerIdx === live.length - 1 ? SCORE_SCALE_MAX : live[dividerIdx + 1]) - MIN_GAP;
  return [lo, hi];
}

function clampToNextValue(dividerIdx, live, rawValue) {
  const [lo, hi] = dividerBounds(dividerIdx, live);
  return roundOneDecimal(Math.min(hi, Math.max(lo, rawValue)));
}

function applyAscValue(thresholds, live, dividerIdx, value, onChange) {
  const nextAsc = [...live];
  nextAsc[dividerIdx] = value;
  const desc = [...nextAsc].reverse();
  onChange(thresholds.map(([, label], i) => [desc[i], label]));
}

// Keeps the latest ascending values in a ref so the pointermove closure reads
// fresh clamps across re-renders during one continuous drag (avoids stale-closure
// clamps from the asc captured at the drag's start).
function makeStartDrag({ barRef, ascRef, thresholds, onChange }) {
  return (dividerIdx) => (downEvent) => {
    if (downEvent.currentTarget.closest('fieldset[disabled]')) return;
    downEvent.preventDefault();
    const rect = barRef.current.getBoundingClientRect();
    const move = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const live = ascRef.current;
      const rawValue = ((clientX - rect.left) / rect.width) * SCORE_SCALE_MAX;
      const value = clampToNextValue(dividerIdx, live, rawValue);
      applyAscValue(thresholds, live, dividerIdx, value, onChange);
    };
    const stop = () => {
      window.removeEventListener(POINTER_EVENT.MOVE, move);
      window.removeEventListener(POINTER_EVENT.UP, stop);
      window.removeEventListener(POINTER_EVENT.CANCEL, stop);
    };
    window.addEventListener(POINTER_EVENT.MOVE, move);
    window.addEventListener(POINTER_EVENT.UP, stop);
    window.addEventListener(POINTER_EVENT.CANCEL, stop);
  };
}

function makeStepKey({ ascRef, thresholds, onChange }) {
  return (dividerIdx, delta) => {
    const live = ascRef.current;
    const next = clampToNextValue(dividerIdx, live, live[dividerIdx] + delta);
    if (next === live[dividerIdx]) return;
    applyAscValue(thresholds, live, dividerIdx, next, onChange);
  };
}

/**
 * Segmented 0-10 bar; thresholds = [[9,'Exemplary'],[7,..],[5,..],[3,..]]
 * (descending). Dragging divider i moves the ascending boundary i.
 * onChange receives a full new thresholds array (descending, labels preserved).
 */
export default function GradeBoundaryBar({ thresholds = [], onChange }) {
  const barRef = useRef(null);
  // ascending boundary values, e.g. [3,5,7,9]
  const asc = [...thresholds].map(([value]) => value).reverse();
  const edges = [0, ...asc, SCORE_SCALE_MAX];
  // Segment names, lowest first, from the thresholds' own labels.
  const names = [BOTTOM_GRADE, ...[...thresholds].map(([, label]) => label).reverse()];

  const ascRef = useRef(asc);
  ascRef.current = asc;

  const startDrag = makeStartDrag({ barRef, ascRef, thresholds, onChange });
  const stepKey = makeStepKey({ ascRef, thresholds, onChange });

  return (
    <div>
      <div className="gf-boundary-bar" ref={barRef}>
        {edges.slice(0, -1).map((edge, i) => (
          <Segment
            key={names[i]}
            i={i}
            name={names[i]}
            nextName={names[i + 1]}
            width={edges[i + 1] - edge}
            hasDivider={i < asc.length}
            dividerValue={asc[i]}
            bounds={i < asc.length ? dividerBounds(i, asc) : null}
            onDrag={startDrag}
            onStepKey={stepKey}
          />
        ))}
      </div>
      <div className="gf-boundary-ticks">
        {edges.slice(0, -1).map((edge, i) => (
          <span key={`tick${i}`} style={{ flex: edges[i + 1] - edge }}>{edge}</span>
        ))}
        <span>{SCORE_SCALE_MAX}</span>
      </div>
    </div>
  );
}

function Segment({ i, name, nextName, width, hasDivider, dividerValue, bounds, onDrag, onStepKey }) {
  return (
    <>
      {/* A segment too narrow for its name shows the initial; the name stays for screen readers and hover. */}
      <div
        className="gf-boundary-seg"
        style={{ flex: width, background: GRADE_COLOR_VARS[i] }}
        title={name}
      >
        <span className="gf-boundary-seg__name">{name}</span>
        <span className="gf-boundary-seg__initial" aria-hidden="true">{name[0]}</span>
      </div>
      {hasDivider ? (
        <div
          className="gf-boundary-divider"
          role="slider"
          aria-label={t('gradeFormula.boundaryAria', { grade: nextName })}
          aria-valuemin={bounds[0]}
          aria-valuemax={bounds[1]}
          aria-valuenow={dividerValue}
          tabIndex={0}
          onPointerDown={onDrag(i)}
          onKeyDown={(e) => {
            if (e.key === KEY.ARROW_RIGHT || e.key === KEY.ARROW_UP) { e.preventDefault(); onStepKey(i, MIN_GAP); }
            else if (e.key === KEY.ARROW_LEFT || e.key === KEY.ARROW_DOWN) { e.preventDefault(); onStepKey(i, -MIN_GAP); }
          }}
        />
      ) : null}
    </>
  );
}
