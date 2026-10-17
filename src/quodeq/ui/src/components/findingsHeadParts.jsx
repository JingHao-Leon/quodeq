/**
 * The Findings header's smaller parts: a tile's change since the previous
 * period, the description cut to two lines, the note on a past run, and the
 * slim bar that takes the header's place at the top once it scrolls away.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import TrendBadge from './TrendBadge.jsx';
import { computeGaugeRing } from './ScoreGauge.jsx';
import { t, LOCALE } from '../strings/index.js';
import { pluralKey } from '../utils/plural.js';

const ARROW_UP = 'up';
const ARROW_DOWN = 'down';
// A clamped paragraph's last line can round a pixel taller than its box.
const CLAMP_SLACK_PX = 1;

/**
 * A tile's change: the arrow follows the number, the colour says whether
 * that is good (`invert` when lower is better), as the severity badges read.
 * @param {{delta: ?number, invert?: boolean, points?: boolean}} props `points`: a whole number (pass-rate points)
 */
export function TileChange({ delta, invert = false, points = false }) {
  if (delta == null) return null;
  return (
    <span className="findings-head__change">
      <TrendBadge delta={points ? String(Math.round(delta)) : delta} invert={invert} arrow={delta < 0 ? ARROW_DOWN : ARROW_UP} />
    </span>
  );
}

/** A description cut to two lines, with "more" to read it all (offered only when it is cut). */
export function Description({ text }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setCut(el.scrollHeight > el.clientHeight + CLAMP_SLACK_PX);
  }, [text, open]);
  return (
    <div className="findings-head__descwrap">
      <p ref={ref} className={`findings-head__desc${open ? '' : ' findings-head__desc--clamped'}`}>{text}</p>
      {(cut || open) && (
        <button type="button" className="findings-head__more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {t(open ? 'violations.scopeDescLess' : 'violations.scopeDescMore')}
        </button>
      )}
    </div>
  );
}

/** A past run on show: which one, and the way back to the latest. */
export function PastRunNote({ pastRun }) {
  return (
    <p className="findings-head__past">
      <span className="findings-head__past-label">{t('violations.headPastLabel')}</span>
      <span className="findings-head__past-when">{pastRun.when}</span>
      <button type="button" className="eval-pill-btn findings-head__back" onClick={pastRun.onBack}>{t('violations.headBackToLatest')}</button>
    </p>
  );
}

/** The header in one line, pinned under the top bar once the full header scrolls away: name, score, violations, pass rate. */
export function SlimBar({ title, grade, metrics, shown }) {
  const ring = grade && !grade.insufficient ? computeGaugeRing(grade.score) : null;
  const violations = t(pluralKey(metrics.violations, 'violations.scopeViolation', 'violations.scopeViolations'),
    { count: metrics.violations.toLocaleString(LOCALE) });
  return (
    <div className="findings-head__sticky" aria-hidden={!shown}>
      <div className={`findings-head__slim qd-cards-panel${shown ? ' is-shown' : ''}`}>
        <span className="findings-head__slim-name">▶ {title}</span>
        {ring && <span className="findings-head__slim-score" style={{ color: ring.ringColor }}>{ring.scoreDisplay} {ring.gradeWord?.toLowerCase()}</span>}
        <span className="findings-head__slim-num">{violations}</span>
        {metrics.passPct != null && <span className="findings-head__slim-num">{t('overview.cardPass', { pct: metrics.passPct })}</span>}
      </div>
    </div>
  );
}
