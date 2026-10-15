import DimensionGaugeCard from '../../dashboard/components/DimensionGaugeCard.jsx';
import { t } from '../../../strings/index.js';

/** Weakest first, as the Overview and the dimension page order their cards; ungraded last. */
const scoreOf = (d) => { const n = parseFloat(d.score); return Number.isNaN(n) ? Infinity : n; };
const weakestFirst = (a, b) => (scoreOf(a) - scoreOf(b)) || a.dimension.localeCompare(b.dimension);

const ONE_DECIMAL = 1;

/** A run's dimension as the cards read one: its score (one decimal, as everywhere: 8.0, not 8) and its crit/maj counts. */
function cardItem(d) {
  const score = parseFloat(d.score);
  return {
    dimension: d.dimension,
    overallScore: Number.isNaN(score) ? d.score : score.toFixed(ONE_DECIMAL),
    totals: { severity: { critical: d.critical || 0, major: d.majors || 0 } },
  };
}

/** What this run changed in the dimension: new and fixed findings (none when it was not compared). */
function RunMoves({ change }) {
  if (!change) return <span className="dim-gauge-card__pass">{t('history.cardNotCompared')}</span>;
  return (
    <span className="dim-gauge-card__pass rl-card-moves">
      <span className={change.new ? 'rl-new' : 'rl-zero'}>{t('history.cardNew', { count: change.new })}</span>
      <span className={change.resolved ? 'rl-fixed' : 'rl-zero'}>{t('history.cardFixed', { count: change.resolved })}</span>
    </span>
  );
}

/**
 * The run's dimensions as the app's compact cards (ring and score, grade
 * word, severity pills), each with what the run changed in it (new and
 * fixed findings), weakest first; a card opens that dimension as of the run.
 */
export default function RunDimensions({ run, diff, onOpen }) {
  const dims = [...(run.dimensionDetails || [])].sort(weakestFirst);
  return (
    <div className="qd-cards-row rl-cards">
      {dims.map((d) => (
        <DimensionGaugeCard key={d.dimension} item={cardItem(d)} compact showDate={false}
          onDimensionClick={() => onOpen(d)} footer={<RunMoves change={diff?.perDim?.[d.dimension]} />} />
      ))}
    </div>
  );
}
