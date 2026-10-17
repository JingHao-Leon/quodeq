import { t } from '../strings/index.js';
import { CRIT_MAJ } from '../vocab/severity.js';
import RunSevText from './RunSevText.jsx';

/** One line of a card's footer: a count in its colour (muted at zero), then its criticals and majors. */
function MoveLine({ count, cls, label, sev }) {
  return (
    <span className="rl-card-move">
      <span className={count ? cls : 'rl-zero'}>{label}</span>
      <RunSevText counts={sev} levels={CRIT_MAJ} />
    </span>
  );
}

/**
 * A dimension card's footer on a run (History's run cards, the run page):
 * what the run changed in the dimension against the run it was compared
 * with, its new and fixed findings with their criticals and majors; "not
 * compared" when it was not.
 * @param {{change: ?{new: number, resolved: number, newSev: object, resolvedSev: object}}} props
 *   the dimension's entry of summariseDiff's `perDim`
 */
export default function RunChangeFooter({ change }) {
  if (!change) return <span className="dim-gauge-card__pass">{t('history.cardNotCompared')}</span>;
  return (
    <span className="rl-card-moves">
      <MoveLine count={change.new} cls="rl-new" label={t('history.cardNew', { count: change.new })} sev={change.newSev} />
      <MoveLine count={change.resolved} cls="rl-fixed" label={t('history.cardFixed', { count: change.resolved })} sev={change.resolvedSev} />
    </span>
  );
}
