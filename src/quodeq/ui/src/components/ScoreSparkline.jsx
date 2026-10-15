import { getGradeThresholds } from '../utils/gradeThresholds.js';
import { scoreGradeColorVar } from '../utils/gradeFormatting.js';
import { SCORE_SCALE_MAX } from '../constants.js';
import { t } from '../strings/index.js';

// Drawn in a 0..100 x 0..SPARK_H box, stretched to the container's width.
const SPARK_W = 100;
const SPARK_H = 36;
const BAND_OPACITY = 0.08;
const DOT_R = 1.6;
const LAST_DOT_R = 2.4;
const ONE_DECIMAL = 1;
// A line needs two points; one point is a dot.
const MIN_POINTS = 2;

const yOf = (score) => SPARK_H - (Math.max(0, Math.min(score, SCORE_SCALE_MAX)) / SCORE_SCALE_MAX) * SPARK_H;

/** The grade bands behind the line, each grade's score range faintly in its colour (as the history charts). */
function Bands() {
  const rows = getGradeThresholds();
  const bounds = [SCORE_SCALE_MAX, ...rows.map(([min]) => min), 0];
  return bounds.slice(0, -1).map((top, i) => {
    const bottom = bounds[i + 1];
    return <rect key={bottom} x={0} y={yOf(top)} width={SPARK_W} height={yOf(bottom) - yOf(top)}
      fill={scoreGradeColorVar((top + bottom) / 2)} opacity={BAND_OPACITY} />;
  });
}

/** One period's point, titled with its date and score; the last one larger and full strength. */
function SparkDot({ x, y, point, isLast }) {
  return (
    <circle cx={x} cy={y} r={isLast ? LAST_DOT_R : DOT_R} className={isLast ? 'score-spark__dot score-spark__dot--last' : 'score-spark__dot'}>
      <title>{t('violations.sparkPoint', { date: point.dateLabel || '', score: point.score.toFixed(ONE_DECIMAL) })}</title>
    </circle>
  );
}

/**
 * A score's recent history in one line: the score per period (oldest first)
 * over the grade bands, each point titled with its date and score, the last
 * one marked. Nothing with fewer than two periods.
 * @param {{points: {score: number, dateLabel?: string}[], label: string}} props
 */
export default function ScoreSparkline({ points, label }) {
  if (!points || points.length < MIN_POINTS) return null;
  const step = SPARK_W / (points.length - 1);
  const xy = points.map((p, i) => [i * step, yOf(p.score)]);
  const last = points[points.length - 1];
  return (
    <div className="score-spark">
      <svg className="score-spark__svg" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <Bands />
        <polyline className="score-spark__line" points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" vectorEffect="non-scaling-stroke" />
        {xy.map(([x, y], i) => <SparkDot key={points[i].dateLabel || i} x={x} y={y} point={points[i]} isLast={points[i] === last} />)}
      </svg>
      <span className="score-spark__range">{t('violations.sparkRange', { count: points.length, first: points[0].dateLabel || '', last: last.dateLabel || '' })}</span>
    </div>
  );
}
