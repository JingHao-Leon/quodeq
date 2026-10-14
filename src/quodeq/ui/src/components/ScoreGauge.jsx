/**
 * The score ring: a score's share of the scale drawn in its grade colour,
 * the score and grade word inside, and its dashed form when the evidence
 * is not enough to grade. Read by the dimension cards and the Findings
 * headers (a dimension, a principle).
 */
import { splitScore, scoreGradeColorVar } from '../utils/formatters.js';
import { scoreToGradeLabel } from '../utils/gradeThresholds.js';
import { t } from '../strings/index.js';
import { SCORE_SCALE_MAX } from '../constants.js';

// SVG geometry — tuned to look right inside the card without scaling JS.
const RING_SIZE = 100;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
const RING_CX = RING_SIZE / 2;
const RING_CY = RING_SIZE / 2;
// Text baseline offsets from ring center: score sits just above, grade word
// just below.
const SCORE_TEXT_OFFSET_Y = 4;
const GRADE_TEXT_OFFSET_Y = 16;

/** The ring when the evidence is not enough to grade: dashed, a dash for the score, and the reason under it. */
export function InsufficientGauge() {
  return (
    <>
      <div className="dim-gauge-card__gauge dim-gauge-card__gauge--insuf" aria-hidden="true">
        <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          <circle
            className="dim-gauge-card__ring-bg"
            cx={RING_CX} cy={RING_CY} r={RING_RADIUS}
            strokeWidth={RING_STROKE}
            strokeDasharray="3 4"
          />
          <text className="dim-gauge-card__score" x={RING_CX} y={RING_CY - SCORE_TEXT_OFFSET_Y}>—</text>
          <text className="dim-gauge-card__grade" x={RING_CX} y={RING_CY + GRADE_TEXT_OFFSET_Y}>{t('overview.insufficientGrade')}</text>
        </svg>
      </div>
      <div className="dim-gauge-card__insuf-line">{t('overview.insufficientEvidence')}</div>
    </>
  );
}

/** The ring of a graded score (computeGaugeRing's output). */
export function ScoreGauge({ scoreDisplay, gradeWord, ringColor, dashOffset }) {
  return (
    <div className="dim-gauge-card__gauge" aria-hidden="true">
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <circle
          className="dim-gauge-card__ring-bg"
          cx={RING_CX} cy={RING_CY} r={RING_RADIUS}
          strokeWidth={RING_STROKE}
        />
        <circle
          className="dim-gauge-card__ring-fill"
          cx={RING_CX} cy={RING_CY} r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          stroke={ringColor}
          strokeDasharray={RING_CIRC}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
        />
        <text className="dim-gauge-card__score" x={RING_CX} y={RING_CY - SCORE_TEXT_OFFSET_Y}>
          {scoreDisplay}
        </text>
        {gradeWord && (
          <text className="dim-gauge-card__grade" x={RING_CX} y={RING_CY + GRADE_TEXT_OFFSET_Y}>
            {gradeWord}
          </text>
        )}
      </svg>
    </div>
  );
}

/**
 * Ring geometry and colour for a score. A score that does not parse draws an empty muted ring and no grade word.
 */
export function computeGaugeRing(overallScore) {
  const { value: scoreDisplay } = splitScore(overallScore);
  const scoreNum = parseFloat(overallScore);
  const hasScore = !Number.isNaN(scoreNum);
  const pct = hasScore ? Math.max(0, Math.min(scoreNum / SCORE_SCALE_MAX, 1)) : 0;
  const label = hasScore ? scoreToGradeLabel(scoreNum) : null;
  return {
    scoreDisplay,
    gradeWord: label ? label.toUpperCase() : null,
    ringColor: hasScore ? scoreGradeColorVar(scoreNum) : 'var(--color-text-muted)',
    dashOffset: RING_CIRC * (1 - pct),
  };
}
