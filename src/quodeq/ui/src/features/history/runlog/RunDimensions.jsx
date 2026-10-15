import DimensionGaugeCard from '../../dashboard/components/DimensionGaugeCard.jsx';
import { t } from '../../../strings/index.js';
import RunSevText from './RunSevText.jsx';
import { CRIT_MAJ } from './RunSevRow.jsx';

const ONE_DECIMAL = 1;

/** A dimension's score as a number; ungraded sorts last. */
const scoreOf = (d) => { const n = parseFloat(d.score); return Number.isNaN(n) ? Infinity : n; };

/** Weakest first, as the Overview and the dimension page order their cards; ties by name. */
const weakestFirst = (a, b) => (scoreOf(a) - scoreOf(b)) || a.dimension.localeCompare(b.dimension);

/** A run's dimension as the cards read one: its score (one decimal, as everywhere: 8.0, not 8) and its crit/maj counts. */
function cardItem(d) {
  const score = parseFloat(d.score);
  return {
    dimension: d.dimension,
    overallScore: Number.isNaN(score) ? d.score : score.toFixed(ONE_DECIMAL),
    totals: { severity: { critical: d.critical || 0, major: d.majors || 0 } },
  };
}

/** One line of a card's footer: a count in its colour (muted at zero), then its criticals and majors. */
function MoveLine({ count, cls, label, sev }) {
  return (
    <span className="rl-card-move">
      <span className={count ? cls : 'rl-zero'}>{label}</span>
      <RunSevText counts={sev} levels={CRIT_MAJ} />
    </span>
  );
}

/** What this run changed in the dimension: new and fixed findings (none when it was not compared). */
function RunMoves({ change }) {
  if (!change) return <span className="dim-gauge-card__pass">{t('history.cardNotCompared')}</span>;
  return (
    <span className="rl-card-moves">
      <MoveLine count={change.new} cls="rl-new" label={t('history.cardNew', { count: change.new })} sev={change.newSev} />
      <MoveLine count={change.resolved} cls="rl-fixed" label={t('history.cardFixed', { count: change.resolved })} sev={change.resolvedSev} />
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
